import type { GameplayPropertyCommand } from "../commands/gameplay-command";
import type { GameplayDomainEvent } from "../events/domain-event";
import type { ActiveGameplayAggregateState, ActiveGameplayAggregateTurn } from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import { checkedAddMatchCash, checkedSubtractMatchCash, matchCash } from "../model/money";
import { BOARD_SPACES } from "./board-definition";
import { buildHotel, buildHouse, sellHotel, sellHouse, type BuildingMutationResult } from "./building-rules";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import {
  activeGameplayPlayer,
  createClockedGameplayTurn,
  freezeActiveGameplayState,
  type GameplayTransitionContext,
  type GameplayTransitionResult,
} from "./gameplay-turn-transition";
import { calculateRent } from "./property-rules";

function reject(
  state: ActiveGameplayAggregateState,
  code: "INVALID_COMMAND" | "INVALID_STATE" | "STALE_STATE_VERSION" | "UNAUTHORIZED_ACTOR" |
    "INVALID_PHASE" | "PROPERTY_NOT_AVAILABLE" | "INSUFFICIENT_CASH" | "ARITHMETIC_OVERFLOW",
  message: string,
  retryable = false,
): GameplayTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validPosition(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < GAMEPLAY_POLICY.boardSize;
}

function validCommand(command: GameplayPropertyCommand): boolean {
  if (!isPlainObject(command)) return false;
  const keys = Object.keys(command);
  if (keys.length !== 3 || !keys.includes("type") || !keys.includes("expectedStateVersion") || !keys.includes("payload")) {
    return false;
  }
  if (!isPlainObject(command.payload)) return false;
  if (command.type === "payMevTax" || command.type === "payPriorityFeeTax") {
    return Object.keys(command.payload).length === 0;
  }
  if (command.type === "sellBuilding") {
    return Object.keys(command.payload).length === 2 &&
      Object.hasOwn(command.payload, "position") &&
      Object.hasOwn(command.payload, "buildingType") &&
      validPosition(command.payload.position) &&
      (command.payload.buildingType === "house" || command.payload.buildingType === "hotel");
  }
  if (!["buyProperty", "declineProperty", "payRent", "buildHouse", "buildHotel"].includes(command.type)) {
    return false;
  }
  return Object.keys(command.payload).length === 1 &&
    Object.hasOwn(command.payload, "position") &&
    validPosition(command.payload.position);
}

function phaseAfterResolvedAction(
  state: ActiveGameplayAggregateState,
  nowMs: number,
): ActiveGameplayAggregateTurn | null {
  if (state.lastDice === null) return null;
  return createClockedGameplayTurn(
    state.lastDice.isDoubles ? "awaitingRoll" : "awaitingEndTurn",
    state.turn.currentSeatIndex,
    nowMs,
  );
}

function buildingPhase(
  state: ActiveGameplayAggregateState,
  nowMs: number,
): ActiveGameplayAggregateTurn | null {
  if (state.turn.phase !== "awaitingRoll" && state.turn.phase !== "awaitingEndTurn") return null;
  return createClockedGameplayTurn(state.turn.phase, state.turn.currentSeatIndex, nowMs);
}

function buildingError(result: Extract<BuildingMutationResult, { readonly ok: false }>): {
  readonly code: "INSUFFICIENT_CASH" | "ARITHMETIC_OVERFLOW" | "PROPERTY_NOT_AVAILABLE";
  readonly message: string;
} {
  if (result.code === "INSUFFICIENT_CASH") return { code: "INSUFFICIENT_CASH", message: "player cannot afford the building" };
  if (result.code === "ARITHMETIC_OVERFLOW") return { code: "ARITHMETIC_OVERFLOW", message: "building cash result exceeds limits" };
  return { code: "PROPERTY_NOT_AVAILABLE", message: `building action is unavailable: ${result.code}` };
}

export function transitionGameplayProperty(
  state: ActiveGameplayAggregateState,
  command: GameplayPropertyCommand,
  context: GameplayTransitionContext,
): GameplayTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  if (
    !validCommand(command) ||
    !Number.isSafeInteger(context.nowMs) ||
    context.nowMs < state.turn.startedAtMs ||
    !Number.isInteger(command.expectedStateVersion) ||
    command.expectedStateVersion < 0
  ) return reject(state, "INVALID_COMMAND", "command context is invalid");
  if (command.expectedStateVersion !== state.stateVersion) {
    return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  }
  if (state.stateVersion >= MAX_STATE_VERSION) return reject(state, "INVALID_STATE", "state version cannot advance");
  const current = activeGameplayPlayer(state);
  if (current === null) return reject(state, "INVALID_STATE", "turn does not reference an active player");
  if (context.actor.kind !== "player" || context.actor.playerId !== current.playerId) {
    return reject(state, "UNAUTHORIZED_ACTOR", "only the current player can execute this property command");
  }
  if (state.bankruptcyRequiredSeatIndex !== null) {
    return reject(state, "INVALID_PHASE", "bankruptcy must be resolved before another action");
  }

  if (command.type === "buyProperty" || command.type === "declineProperty") {
    if (
      state.turn.phase !== "awaitingPropertyDecision" ||
      state.turn.propertyPosition !== command.payload.position
    ) return reject(state, "INVALID_PHASE", "property decision does not match the pending landing");
    const definition = BOARD_SPACES[command.payload.position];
    const property = state.properties[command.payload.position];
    if (
      definition === undefined || property === undefined || property.ownerSeatIndex !== null ||
      !["street", "railroad", "utility"].includes(definition.propertyType)
    ) return reject(state, "PROPERTY_NOT_AVAILABLE", "property is not available");
    const turn = phaseAfterResolvedAction(state, context.nowMs);
    if (turn === null) return reject(state, "INVALID_STATE", "property decision has no originating dice roll");
    const price = matchCash(BigInt(definition.price));
    if (command.type === "declineProperty") {
      const next = freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, turn });
      return {
        ok: true,
        state: next,
        events: Object.freeze([Object.freeze({
          type: "propertyDeclined" as const,
          playerId: current.playerId,
          position: command.payload.position,
          price,
        })]),
      };
    }
    const cash = checkedSubtractMatchCash(current.cash, price);
    if (cash === null) return reject(state, "INSUFFICIENT_CASH", "player cannot afford the property");
    const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
      ? { ...player, cash }
      : player);
    const properties = state.properties.map((candidate) => candidate.position === command.payload.position
      ? { ...candidate, ownerSeatIndex: current.seatIndex }
      : candidate);
    const next = freezeActiveGameplayState(state, {
      stateVersion: state.stateVersion + 1,
      players,
      properties,
      turn,
    });
    return {
      ok: true,
      state: next,
      events: Object.freeze([Object.freeze({
        type: "propertyPurchased" as const,
        playerId: current.playerId,
        position: command.payload.position,
        price,
      })]),
    };
  }

  if (command.type === "payRent") {
    if (state.turn.phase !== "awaitingRentPayment" || state.turn.propertyPosition !== command.payload.position) {
      return reject(state, "INVALID_PHASE", "rent payment does not match the pending landing");
    }
    if (state.lastDice === null) return reject(state, "INVALID_STATE", "rent payment has no originating dice roll");
    const property = state.properties[command.payload.position];
    const owner = property?.ownerSeatIndex === null || property?.ownerSeatIndex === undefined
      ? null
      : state.players[property.ownerSeatIndex];
    if (property === undefined || owner === null || owner === undefined || owner.status !== "active") {
      return reject(state, "PROPERTY_NOT_AVAILABLE", "rent owner is unavailable");
    }
    const amount = calculateRent(state.properties, command.payload.position, state.lastDice.total);
    if (amount === null) return reject(state, "INVALID_STATE", "rent cannot be derived");
    const turn = phaseAfterResolvedAction(state, context.nowMs);
    if (turn === null) return reject(state, "INVALID_STATE", "rent payment has no valid continuation");
    const payerCash = checkedSubtractMatchCash(current.cash, amount);
    if (payerCash === null) {
      const bankruptcyTurn = createClockedGameplayTurn("awaitingBankruptcy", current.seatIndex, context.nowMs);
      if (bankruptcyTurn === null) return reject(state, "INVALID_STATE", "bankruptcy deadline exceeds limits");
      return {
        ok: true,
        state: freezeActiveGameplayState(state, {
          stateVersion: state.stateVersion + 1,
          turn: bankruptcyTurn,
          bankruptcyRequiredSeatIndex: current.seatIndex,
        }),
        events: Object.freeze([]),
      };
    }
    const ownerCash = checkedAddMatchCash(owner.cash, amount);
    if (ownerCash === null) return reject(state, "ARITHMETIC_OVERFLOW", "rent would overflow owner cash");
    const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
      ? { ...player, cash: payerCash }
      : index === owner.seatIndex
        ? { ...player, cash: ownerCash }
        : player);
    const next = freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, players, turn });
    return {
      ok: true,
      state: next,
      events: Object.freeze([Object.freeze({
        type: "rentPaid" as const,
        payerId: current.playerId,
        ownerId: owner.playerId,
        position: command.payload.position,
        amount,
      })]),
    };
  }

  if (command.type === "payMevTax" || command.type === "payPriorityFeeTax") {
    const taxKind = command.type === "payMevTax" ? "mev" : "priorityFee";
    if (state.turn.phase !== "awaitingTaxPayment" || state.turn.taxKind !== taxKind) {
      return reject(state, "INVALID_PHASE", "tax command does not match the pending landing");
    }
    const policy = taxKind === "mev" ? GAMEPLAY_POLICY.mevTax : GAMEPLAY_POLICY.priorityFeeTax;
    if (current.position !== policy.position) return reject(state, "INVALID_STATE", "tax position is inconsistent");
    const amount = matchCash(policy.amount);
    const cash = checkedSubtractMatchCash(current.cash, amount);
    if (cash === null) {
      if (taxKind === "priorityFee") {
        return reject(state, "INSUFFICIENT_CASH", "player cannot afford the priority fee tax");
      }
      const turn = createClockedGameplayTurn("awaitingBankruptcy", current.seatIndex, context.nowMs);
      if (turn === null) return reject(state, "INVALID_STATE", "bankruptcy deadline exceeds limits");
      return {
        ok: true,
        state: freezeActiveGameplayState(state, {
          stateVersion: state.stateVersion + 1,
          turn,
          bankruptcyRequiredSeatIndex: current.seatIndex,
        }),
        events: Object.freeze([]),
      };
    }
    const turn = phaseAfterResolvedAction(state, context.nowMs);
    if (turn === null) return reject(state, "INVALID_STATE", "tax payment has no valid continuation");
    const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
      ? { ...player, cash }
      : player);
    const next = freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, players, turn });
    return {
      ok: true,
      state: next,
      events: Object.freeze([Object.freeze({
        type: "taxPaid" as const,
        playerId: current.playerId,
        position: policy.position,
        taxKind,
        amount,
      })]),
    };
  }

  const turn = buildingPhase(state, context.nowMs);
  if (turn === null) return reject(state, "INVALID_PHASE", "building action is unavailable while another action is pending");
  const inventory = { housesRemaining: state.housesRemaining, hotelsRemaining: state.hotelsRemaining };
  const result = command.type === "buildHouse"
    ? buildHouse(state.properties, inventory, command.payload.position, current.seatIndex, current.cash)
    : command.type === "buildHotel"
      ? buildHotel(state.properties, inventory, command.payload.position, current.seatIndex, current.cash)
      : command.payload.buildingType === "house"
        ? sellHouse(state.properties, inventory, command.payload.position, current.seatIndex, current.cash)
        : sellHotel(state.properties, inventory, command.payload.position, current.seatIndex, current.cash);
  if (!result.ok) {
    const error = buildingError(result);
    return reject(state, error.code, error.message);
  }
  const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
    ? { ...player, cash: result.cash }
    : player);
  const next = freezeActiveGameplayState(state, {
    stateVersion: state.stateVersion + 1,
    players,
    properties: result.properties,
    housesRemaining: result.inventory.housesRemaining,
    hotelsRemaining: result.inventory.hotelsRemaining,
    turn,
  });
  const position = command.payload.position;
  const property = next.properties[position];
  if (property === undefined) return reject(state, "INVALID_STATE", "building result lost its property");
  const event: GameplayDomainEvent = command.type === "buildHouse" || command.type === "buildHotel"
    ? Object.freeze({
        type: "buildingBuilt" as const,
        playerId: current.playerId,
        position,
        buildingType: command.type === "buildHouse" ? "house" as const : "hotel" as const,
        houseCount: property.houses,
        cost: result.amount,
      })
    : Object.freeze({
        type: "buildingSold" as const,
        playerId: current.playerId,
        position,
        buildingType: command.payload.buildingType,
        salePrice: result.amount,
      });
  return { ok: true, state: next, events: Object.freeze([event]) };
}
