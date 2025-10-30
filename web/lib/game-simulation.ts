// import { GameAccount, PlayerAccount, PropertyAccount } from "@/types/schema";
// import { Address } from "@solana/kit";
// import { boardData, BoardSpace, PropertySpace, RailroadSpace, UtilitySpace } from "@/configs/board-data";
// import {
//   STARTING_MONEY,
//   GO_SALARY,
//   JAIL_FINE,
//   MAX_JAIL_TURNS,
//   MEV_TAX_AMOUNT,
//   PRIORITY_FEE_TAX_AMOUNT,
//   TOTAL_HOUSES,
//   TOTAL_HOTELS,
//   MAX_HOUSES_PER_PROPERTY,
//   RAILROAD_BASE_RENT,
//   UTILITY_MULTIPLIER_ONE,
//   UTILITY_MULTIPLIER_TWO,
//   GO_POSITION,
//   JAIL_POSITION,
//   FREE_PARKING_POSITION,
//   GO_TO_JAIL_POSITION,
//   MEV_TAX_POSITION,
//   PRIORITY_FEE_TAX_POSITION,
//   CHANCE_POSITIONS,
//   COMMUNITY_CHEST_POSITIONS,
//   RAILROAD_POSITIONS,
//   UTILITY_POSITIONS,
//   CHANCE_CARDS,
//   COMMUNITY_CHEST_CARDS,
//   CardEffectType,
//   PlayerActionFlag,
//   GameStatus,
//   getNextPosition,
//   passedGo,
//   isChancePosition,
//   isCommunityChestPosition,
//   isRailroadPosition,
//   isUtilityPosition,
//   isPropertyPosition
// } from "@/lib/constants";
// import { GameStatus as GeneratedGameStatus } from "@/lib/sdk/generated/types/gameStatus";
// import { ColorGroup } from "@/lib/sdk/generated/types/colorGroup";
// import { PropertyType } from "@/lib/sdk/generated/types/propertyType";

// // Game log entry type
// export interface GameLogEntry {
//   id: string;
//   type: "dice" | "move" | "property" | "rent" | "tax" | "card" | "jail" | "bankruptcy" | "turn" | "building" | "trade";
//   message: string;
//   details?: any;
//   timestamp: number;
//   playerId?: Address;
// }

// // Dice roll result
// export interface DiceRoll {
//   die1: number;
//   die2: number;
//   total: number;
//   isDoubles: boolean;
// }

// // Property action result
// export interface PropertyActionResult {
//   success: boolean;
//   message: string;
//   rentAmount?: number;
//   purchasePrice?: number;
// }

// // Card draw result
// export interface CardDrawResult {
//   cardId: number;
//   effectType: CardEffectType;
//   amount: number;
//   message: string;
//   executed: boolean;
// }

// // Game simulation class
// export class MonopolyGameSimulation {
//   private gameState: GameAccount;
//   private players: Map<Address, PlayerAccount>;
//   private properties: Map<number, PropertyAccount>;
//   private gameLogs: GameLogEntry[];
//   private cardDecks: {
//     chance: number[];
//     communityChest: number[];
//   };

//   constructor(
//     initialGameState: GameAccount,
//     initialPlayers: PlayerAccount[],
//     initialProperties: PropertyAccount[]
//   ) {
//     this.gameState = { ...initialGameState };
//     this.players = new Map(initialPlayers.map(p => [p.wallet, { ...p }]));
//     this.properties = new Map(initialProperties.map(p => [p.position, { ...p }]));
//     this.gameLogs = [];
    
//     // Initialize shuffled card decks
//     this.cardDecks = {
//       chance: this.shuffleArray([...Array(CHANCE_CARDS.length).keys()]),
//       communityChest: this.shuffleArray([...Array(COMMUNITY_CHEST_CARDS.length).keys()])
//     };
//   }

//   // Utility methods
//   private shuffleArray(array: number[]): number[] {
//     const shuffled = [...array];
//     for (let i = shuffled.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
//     }
//     return shuffled;
//   }

//   private generateId(): string {
//     return Math.random().toString(36).substr(2, 9);
//   }

//   private addLog(entry: Omit<GameLogEntry, 'id' | 'timestamp'>): void {
//     this.gameLogs.push({
//       ...entry,
//       id: this.generateId(),
//       timestamp: Date.now()
//     });
//   }

//   private getCurrentPlayer(): PlayerAccount | null {
//     const playerWallets = Array.from(this.players.keys());
//     if (this.gameState.currentTurn >= playerWallets.length) return null;
    
//     const currentWallet = playerWallets[this.gameState.currentTurn];
//     return this.players.get(currentWallet) || null;
//   }

//   private getBoardSpace(position: number): BoardSpace | null {
//     return boardData[position] || null;
//   }

//   private getPropertyData(position: number): PropertySpace | RailroadSpace | UtilitySpace | null {
//     const space = this.getBoardSpace(position);
//     if (!space || !['property', 'railroad', 'utility'].includes(space.type)) {
//       return null;
//     }
//     return space as PropertySpace | RailroadSpace | UtilitySpace;
//   }

//   // Core game actions
//   public rollDice(): { success: boolean; diceRoll?: DiceRoll; message: string } {
//     const currentPlayer = this.getCurrentPlayer();
//     if (!currentPlayer) {
//       return { success: false, message: "No current player found" };
//     }

//     if (currentPlayer.hasRolledDice) {
//       return { success: false, message: "Player has already rolled dice this turn" };
//     }

//     // Generate dice roll
//     const die1 = Math.floor(Math.random() * 6) + 1;
//     const die2 = Math.floor(Math.random() * 6) + 1;
//     const total = die1 + die2;
//     const isDoubles = die1 === die2;

//     const diceRoll: DiceRoll = { die1, die2, total, isDoubles };

//     // Update player state
//     currentPlayer.hasRolledDice = true;
//     currentPlayer.lastDiceRoll = new Uint8Array([die1, die2]);

//     // Handle jail logic
//     if (currentPlayer.inJail) {
//       return this.handleJailDiceRoll(currentPlayer, diceRoll);
//     }

//     // Handle doubles
//     if (isDoubles) {
//       currentPlayer.doublesCount++;
//       if (currentPlayer.doublesCount >= 3) {
//         // Three doubles in a row - go to jail
//         this.sendPlayerToJail(currentPlayer);
//         this.addLog({
//           type: "jail",
//           message: `${this.getPlayerName(currentPlayer.wallet)} rolled three doubles and went to jail!`,
//           playerId: currentPlayer.wallet
//         });
//         return { success: true, diceRoll, message: "Rolled three doubles - sent to jail!" };
//       }
//     } else {
//       currentPlayer.doublesCount = 0;
//     }

//     // Move player
//     const oldPosition = currentPlayer.position;
//     const newPosition = getNextPosition(oldPosition, total);
//     currentPlayer.position = newPosition;

//     // Check if passed GO
//     if (passedGo(oldPosition, newPosition)) {
//       this.collectGoSalary(currentPlayer);
//     }

//     this.addLog({
//       type: "dice",
//       message: `${this.getPlayerName(currentPlayer.wallet)} rolled ${die1} and ${die2} (total: ${total})`,
//       details: { diceRoll, oldPosition, newPosition },
//       playerId: currentPlayer.wallet
//     });

//     // Handle landing on space
//     this.handleSpaceLanding(currentPlayer, newPosition);

//     return { success: true, diceRoll, message: `Rolled ${total}` };
//   }

//   private handleJailDiceRoll(player: PlayerAccount, diceRoll: DiceRoll): { success: boolean; diceRoll: DiceRoll; message: string } {
//     if (diceRoll.isDoubles) {
//       // Doubles - get out of jail
//       player.inJail = false;
//       player.jailTurns = 0;
//       player.doublesCount = 0;

//       // Move player
//       const newPosition = getNextPosition(player.position, diceRoll.total);
//       player.position = newPosition;

//       this.addLog({
//         type: "jail",
//         message: `${this.getPlayerName(player.wallet)} rolled doubles and got out of jail!`,
//         playerId: player.wallet
//       });

//       this.handleSpaceLanding(player, newPosition);
//       return { success: true, diceRoll, message: "Rolled doubles - got out of jail!" };
//     } else {
//       // No doubles - increment jail turns
//       player.jailTurns++;
      
//       if (player.jailTurns >= MAX_JAIL_TURNS) {
//         // Must pay fine and get out
//         return this.payJailFine(player.wallet);
//       }

//       this.addLog({
//         type: "jail",
//         message: `${this.getPlayerName(player.wallet)} failed to roll doubles (turn ${player.jailTurns}/${MAX_JAIL_TURNS})`,
//         playerId: player.wallet
//       });

//       return { success: true, diceRoll, message: `Failed to roll doubles (${player.jailTurns}/${MAX_JAIL_TURNS} turns)` };
//     }
//   }

//   private sendPlayerToJail(player: PlayerAccount): void {
//     player.position = JAIL_POSITION;
//     player.inJail = true;
//     player.jailTurns = 0;
//     player.doublesCount = 0;
//     player.hasRolledDice = true; // End turn
//   }

//   private collectGoSalary(player: PlayerAccount): void {
//     player.cashBalance += BigInt(GO_SALARY);
//     this.addLog({
//       type: "move",
//       message: `${this.getPlayerName(player.wallet)} passed GO and collected $${GO_SALARY}`,
//       details: { amount: GO_SALARY },
//       playerId: player.wallet
//     });
//   }

//   private handleSpaceLanding(player: PlayerAccount, position: number): void {
//     const space = this.getBoardSpace(position);
//     if (!space) return;

//     this.addLog({
//       type: "move",
//       message: `${this.getPlayerName(player.wallet)} landed on ${space.name}`,
//       playerId: player.wallet
//     });

//     // Handle different space types
//     switch (space.type) {
//       case "property":
//       case "railroad":
//       case "utility":
//         this.handlePropertySpace(player, position);
//         break;
//       case "tax":
//         this.handleTaxSpace(player, position);
//         break;
//       case "chance":
//         this.handleChanceSpace(player);
//         break;
//       case "community-chest":
//         this.handleCommunityChestSpace(player);
//         break;
//       case "corner":
//         this.handleCornerSpace(player, position);
//         break;
//     }
//   }

//   private handlePropertySpace(player: PlayerAccount, position: number): void {
//     const property = this.properties.get(position);
    
//     if (!property || !property.owner) {
//       // Property is available for purchase
//       player.needsPropertyAction = true;
//       player.pendingPropertyPosition = position;
      
//       this.addLog({
//         type: "property",
//         message: `${this.getPlayerName(player.wallet)} can purchase ${this.getBoardSpace(position)?.name}`,
//         playerId: player.wallet
//       });
//     } else if (property.owner !== player.wallet && !property.isMortgaged) {
//       // Pay rent to owner
//       const rentAmount = this.calculateRent(property);
//       this.payRent(player, property, rentAmount);
//     }
//   }

//   private handleTaxSpace(player: PlayerAccount, position: number): void {
//     let taxAmount = 0;
//     let taxType = "";

//     if (position === MEV_TAX_POSITION) {
//       taxAmount = MEV_TAX_AMOUNT;
//       taxType = "MEV Tax";
//     } else if (position === PRIORITY_FEE_TAX_POSITION) {
//       taxAmount = PRIORITY_FEE_TAX_AMOUNT;
//       taxType = "Priority Fee Tax";
//     }

//     if (taxAmount > 0) {
//       player.cashBalance -= BigInt(taxAmount);
//       this.gameState.bankBalance += BigInt(taxAmount);

//       this.addLog({
//         type: "tax",
//         message: `${this.getPlayerName(player.wallet)} paid ${taxType} of $${taxAmount}`,
//         details: { taxType, amount: taxAmount },
//         playerId: player.wallet
//       });

//       this.checkBankruptcy(player);
//     }
//   }

//   private handleChanceSpace(player: PlayerAccount): void {
//     player.needsChanceCard = true;
//     this.addLog({
//       type: "card",
//       message: `${this.getPlayerName(player.wallet)} must draw a Chance card`,
//       playerId: player.wallet
//     });
//   }

//   private handleCommunityChestSpace(player: PlayerAccount): void {
//     player.needsCommunityChestCard = true;
//     this.addLog({
//       type: "card",
//       message: `${this.getPlayerName(player.wallet)} must draw a Community Chest card`,
//       playerId: player.wallet
//     });
//   }

//   private handleCornerSpace(player: PlayerAccount, position: number): void {
//     if (position === GO_TO_JAIL_POSITION) {
//       this.sendPlayerToJail(player);
//       this.addLog({
//         type: "jail",
//         message: `${this.getPlayerName(player.wallet)} was sent to jail!`,
//         playerId: player.wallet
//       });
//     } else if (position === FREE_PARKING_POSITION) {
//       // Collect free parking pool if there's money
//       if (this.gameState.freeParkingPool > 0) {
//         player.cashBalance += this.gameState.freeParkingPool;
//         this.addLog({
//           type: "move",
//           message: `${this.getPlayerName(player.wallet)} collected $${this.gameState.freeParkingPool} from Free Parking!`,
//           details: { amount: Number(this.gameState.freeParkingPool) },
//           playerId: player.wallet
//         });
//         this.gameState.freeParkingPool = BigInt(0);
//       }
//     }
//   }

//   // Property actions
//   public buyProperty(playerWallet: Address): PropertyActionResult {
//     const player = this.players.get(playerWallet);
//     if (!player || !player.pendingPropertyPosition) {
//       return { success: false, message: "No pending property purchase" };
//     }

//     const position = player.pendingPropertyPosition;
//     const propertyData = this.getPropertyData(position);
//     if (!propertyData) {
//       return { success: false, message: "Invalid property" };
//     }

//     const price = propertyData.price;
//     if (player.cashBalance < BigInt(price)) {
//       return { success: false, message: "Insufficient funds" };
//     }

//     // Create or update property
//     const property: PropertyAccount = this.properties.get(position) || this.createPropertyAccount(position);
//     property.owner = playerWallet;
    
//     // Deduct money
//     player.cashBalance -= BigInt(price);
//     this.gameState.bankBalance += BigInt(price);

//     // Add to player's properties
//     const propertiesArray = Array.from(player.propertiesOwned || []);
//     propertiesArray.push(position);
//     player.propertiesOwned = new Uint8Array(propertiesArray);

//     // Clear pending action
//     player.needsPropertyAction = false;
//     player.pendingPropertyPosition = null;

//     // Update properties map
//     this.properties.set(position, property);

//     this.addLog({
//       type: "property",
//       message: `${this.getPlayerName(playerWallet)} purchased ${propertyData.name || `Property ${position}`} for $${price}`,
//       details: { position, price },
//       playerId: playerWallet
//     });

//     return { success: true, message: `Purchased property for $${price}`, purchasePrice: price };
//   }

//   public declineProperty(playerWallet: Address): PropertyActionResult {
//     const player = this.players.get(playerWallet);
//     if (!player || !player.pendingPropertyPosition) {
//       return { success: false, message: "No pending property purchase" };
//     }

//     const position = player.pendingPropertyPosition;
//     const propertyData = this.getPropertyData(position);

//     // Clear pending action
//     player.needsPropertyAction = false;
//     player.pendingPropertyPosition = null;

//     this.addLog({
//       type: "property",
//       message: `${this.getPlayerName(playerWallet)} declined to purchase ${propertyData?.name || `Property ${position}`}`,
//       playerId: playerWallet
//     });

//     return { success: true, message: "Property purchase declined" };
//   }

//   // Rent calculation and payment
//   private calculateRent(property: PropertyAccount): number {
//     const propertyData = this.getPropertyData(property.position);
//     if (!propertyData) return 0;

//     if (propertyData.type === "railroad") {
//       const railroadData = propertyData as RailroadSpace;
//       const ownedRailroads = this.countOwnedRailroads(property.owner!);
//       return railroadData.railroadRent[ownedRailroads - 1] || 0;
//     }

//     if (propertyData.type === "utility") {
//       const utilityData = propertyData as UtilitySpace;
//       const ownedUtilities = this.countOwnedUtilities(property.owner!);
//       const multiplier = ownedUtilities === 1 ? utilityData.utilityMultiplier[0] : utilityData.utilityMultiplier[1];
      
//       // Use last dice roll for utility rent calculation
//       const currentPlayer = this.getCurrentPlayer();
//       const lastRoll = currentPlayer?.lastDiceRoll;
//       const diceTotal = lastRoll ? lastRoll[0] + lastRoll[1] : 7; // Default to 7 if no roll
      
//       return diceTotal * multiplier;
//     }

//     // Regular property
//     const propData = propertyData as PropertySpace;
    
//     if (property.hasHotel) {
//       return propData.rentWithHotel;
//     }
    
//     if (property.houses > 0) {
//       const houseRents = [
//         propData.rentWith1House,
//         propData.rentWith2Houses,
//         propData.rentWith3Houses,
//         propData.rentWith4Houses
//       ];
//       return houseRents[property.houses - 1] || propData.baseRent;
//     }

//     // Check if owner has color group monopoly
//     if (this.hasColorGroupMonopoly(property.owner!, propData.colorGroup)) {
//       return propData.rentWithColorGroup;
//     }

//     return propData.baseRent;
//   }

//   private payRent(player: PlayerAccount, property: PropertyAccount, rentAmount: number): void {
//     const owner = this.players.get(property.owner!);
//     if (!owner) return;

//     player.cashBalance -= BigInt(rentAmount);
//     owner.cashBalance += BigInt(rentAmount);

//     this.addLog({
//       type: "rent",
//       message: `${this.getPlayerName(player.wallet)} paid $${rentAmount} rent to ${this.getPlayerName(owner.wallet)}`,
//       details: { amount: rentAmount, property: property.position },
//       playerId: player.wallet
//     });

//     this.checkBankruptcy(player);
//   }

//   // Helper methods for property ownership
//   private countOwnedRailroads(owner: Address): number {
//     return RAILROAD_POSITIONS.filter(pos => {
//       const prop = this.properties.get(pos);
//       return prop?.owner === owner;
//     }).length;
//   }

//   private countOwnedUtilities(owner: Address): number {
//     return UTILITY_POSITIONS.filter(pos => {
//       const prop = this.properties.get(pos);
//       return prop?.owner === owner;
//     }).length;
//   }

//   private hasColorGroupMonopoly(owner: Address, colorGroup: string): boolean {
//     const colorGroupPositions = this.getColorGroupPositions(colorGroup);
//     return colorGroupPositions.every(pos => {
//       const prop = this.properties.get(pos);
//       return prop?.owner === owner;
//     });
//   }

//   private getColorGroupPositions(colorGroup: string): number[] {
//     return boardData
//       .map((space, index) => ({ space, index }))
//       .filter(({ space }) => space.type === "property" && (space as PropertySpace).colorGroup === colorGroup)
//       .map(({ index }) => index);
//   }

//   // Card drawing and effects
//   public drawChanceCard(playerWallet: Address): CardDrawResult {
//     const player = this.players.get(playerWallet);
//     if (!player || !player.needsChanceCard) {
//       return {
//         cardId: -1,
//         effectType: CardEffectType.MONEY,
//         amount: 0,
//         message: "No chance card needed",
//         executed: false
//       };
//     }

//     // Draw card from deck
//     const cardId = this.cardDecks.chance.shift()!;
//     this.cardDecks.chance.push(cardId); // Put back at end of deck

//     const card = CHANCE_CARDS[cardId];
//     const result = this.executeCardEffect(player, card.effect_type, card.amount);

//     player.needsChanceCard = false;

//     this.addLog({
//       type: "card",
//       message: `${this.getPlayerName(playerWallet)} drew Chance card: ${result.message}`,
//       details: { cardId, effectType: card.effect_type, amount: card.amount },
//       playerId: playerWallet
//     });

//     return {
//       cardId,
//       effectType: card.effect_type,
//       amount: card.amount,
//       message: result.message,
//       executed: result.executed
//     };
//   }

//   public drawCommunityChestCard(playerWallet: Address): CardDrawResult {
//     const player = this.players.get(playerWallet);
//     if (!player || !player.needsCommunityChestCard) {
//       return {
//         cardId: -1,
//         effectType: CardEffectType.MONEY,
//         amount: 0,
//         message: "No community chest card needed",
//         executed: false
//       };
//     }

//     // Draw card from deck
//     const cardId = this.cardDecks.communityChest.shift()!;
//     this.cardDecks.communityChest.push(cardId); // Put back at end of deck

//     const card = COMMUNITY_CHEST_CARDS[cardId];
//     const result = this.executeCardEffect(player, card.effect_type, card.amount);

//     player.needsCommunityChestCard = false;

//     this.addLog({
//       type: "card",
//       message: `${this.getPlayerName(playerWallet)} drew Community Chest card: ${result.message}`,
//       details: { cardId, effectType: card.effect_type, amount: card.amount },
//       playerId: playerWallet
//     });

//     return {
//       cardId,
//       effectType: card.effect_type,
//       amount: card.amount,
//       message: result.message,
//       executed: result.executed
//     };
//   }

//   private executeCardEffect(player: PlayerAccount, effectType: CardEffectType, amount: number): { message: string; executed: boolean } {
//     switch (effectType) {
//       case CardEffectType.MONEY:
//         if (amount > 0) {
//           player.cashBalance += BigInt(amount);
//           return { message: `Collect $${amount}`, executed: true };
//         } else {
//           player.cashBalance -= BigInt(Math.abs(amount));
//           this.checkBankruptcy(player);
//           return { message: `Pay $${Math.abs(amount)}`, executed: true };
//         }

//       case CardEffectType.MOVE:
//         const oldPosition = player.position;
//         let newPosition: number;
        
//         if (amount === 0) {
//           // Go to GO
//           newPosition = GO_POSITION;
//         } else if (amount < 0) {
//           // Move backwards
//           newPosition = (player.position + amount + 40) % 40;
//         } else {
//           // Move to specific position
//           newPosition = amount;
//         }

//         player.position = newPosition;
        
//         if (passedGo(oldPosition, newPosition) && amount !== 0) {
//           this.collectGoSalary(player);
//         }
        
//         this.handleSpaceLanding(player, newPosition);
//         return { message: `Move to ${this.getBoardSpace(newPosition)?.name || `position ${newPosition}`}`, executed: true };

//       case CardEffectType.GO_TO_JAIL:
//         this.sendPlayerToJail(player);
//         return { message: "Go to Jail", executed: true };

//       case CardEffectType.GET_OUT_OF_JAIL_FREE:
//         player.getOutOfJailCards++;
//         return { message: "Get Out of Jail Free card received", executed: true };

//       case CardEffectType.COLLECT_FROM_PLAYERS:
//         let totalCollected = 0;
//         for (const [wallet, otherPlayer] of this.players) {
//           if (wallet !== player.wallet) {
//             const payment = Math.min(Number(otherPlayer.cashBalance), amount);
//             otherPlayer.cashBalance -= BigInt(payment);
//             player.cashBalance += BigInt(payment);
//             totalCollected += payment;
//             this.checkBankruptcy(otherPlayer);
//           }
//         }
//         return { message: `Collect $${amount} from each player (total: $${totalCollected})`, executed: true };

//       default:
//         return { message: "Unknown card effect", executed: false };
//     }
//   }

//   // Jail actions
//   public payJailFine(playerWallet: Address): { success: boolean; diceRoll?: DiceRoll; message: string } {
//     const player = this.players.get(playerWallet);
//     if (!player || !player.inJail) {
//       return { success: false, message: "Player is not in jail" };
//     }

//     if (player.cashBalance < BigInt(JAIL_FINE)) {
//       return { success: false, message: "Insufficient funds to pay jail fine" };
//     }

//     // Pay fine
//     player.cashBalance -= BigInt(JAIL_FINE);
//     this.gameState.bankBalance += BigInt(JAIL_FINE);

//     // Get out of jail
//     player.inJail = false;
//     player.jailTurns = 0;

//     // If player has already rolled, move them
//     if (player.hasRolledDice && player.lastDiceRoll) {
//       const die1 = player.lastDiceRoll[0];
//       const die2 = player.lastDiceRoll[1];
//       const total = die1 + die2;
      
//       const newPosition = getNextPosition(player.position, total);
//       player.position = newPosition;
      
//       this.handleSpaceLanding(player, newPosition);
      
//       const diceRoll: DiceRoll = { die1, die2, total, isDoubles: die1 === die2 };
      
//       this.addLog({
//         type: "jail",
//         message: `${this.getPlayerName(playerWallet)} paid $${JAIL_FINE} jail fine and moved ${total} spaces`,
//         details: { fine: JAIL_FINE, diceRoll },
//         playerId: playerWallet
//       });

//       return { success: true, diceRoll, message: `Paid $${JAIL_FINE} fine and moved` };
//     }

//     this.addLog({
//       type: "jail",
//       message: `${this.getPlayerName(playerWallet)} paid $${JAIL_FINE} jail fine`,
//       details: { fine: JAIL_FINE },
//       playerId: playerWallet
//     });

//     return { success: true, message: `Paid $${JAIL_FINE} fine` };
//   }

//   public useGetOutOfJailCard(playerWallet: Address): { success: boolean; message: string } {
//     const player = this.players.get(playerWallet);
//     if (!player || !player.inJail) {
//       return { success: false, message: "Player is not in jail" };
//     }

//     if (player.getOutOfJailCards <= 0) {
//       return { success: false, message: "No Get Out of Jail Free cards" };
//     }

//     // Use card
//     player.getOutOfJailCards--;
//     player.inJail = false;
//     player.jailTurns = 0;

//     this.addLog({
//       type: "jail",
//       message: `${this.getPlayerName(playerWallet)} used a Get Out of Jail Free card`,
//       playerId: playerWallet
//     });

//     return { success: true, message: "Used Get Out of Jail Free card" };
//   }

//   // Turn management
//   public endTurn(): { success: boolean; message: string; nextPlayer?: Address } {
//     const currentPlayer = this.getCurrentPlayer();
//     if (!currentPlayer) {
//       return { success: false, message: "No current player" };
//     }

//     // Check for pending actions
//     if (this.hasPendingActions(currentPlayer)) {
//       return { success: false, message: "Player has pending actions" };
//     }

//     // Check if player gets another turn (doubles and not in jail)
//     if (currentPlayer.doublesCount > 0 && !currentPlayer.inJail) {
//       // Reset for next roll but keep same player
//       currentPlayer.hasRolledDice = false;
//       currentPlayer.lastDiceRoll = new Uint8Array([0, 0]);
      
//       this.addLog({
//         type: "turn",
//         message: `${this.getPlayerName(currentPlayer.wallet)} gets another turn for rolling doubles`,
//         playerId: currentPlayer.wallet
//       });

//       return { success: true, message: "Another turn for doubles", nextPlayer: currentPlayer.wallet };
//     }

//     // Reset player state for next turn
//     currentPlayer.hasRolledDice = false;
//     currentPlayer.lastDiceRoll = new Uint8Array([0, 0]);
//     currentPlayer.doublesCount = 0;

//     // Advance to next player
//     const playerWallets = Array.from(this.players.keys());
//     let nextTurn = (this.gameState.currentTurn + 1) % playerWallets.length;
    
//     // Skip bankrupt players
//     while (this.players.get(playerWallets[nextTurn])?.isBankrupt) {
//       nextTurn = (nextTurn + 1) % playerWallets.length;
//     }

//     this.gameState.currentTurn = nextTurn;
//     const nextPlayerWallet = playerWallets[nextTurn];

//     this.addLog({
//       type: "turn",
//       message: `${this.getPlayerName(nextPlayerWallet)}'s turn`,
//       playerId: nextPlayerWallet
//     });

//     return { success: true, message: "Turn ended", nextPlayer: nextPlayerWallet };
//   }

//   private hasPendingActions(player: PlayerAccount): boolean {
//     return player.needsPropertyAction ||
//            player.needsChanceCard ||
//            player.needsCommunityChestCard ||
//            player.needsBankruptcyCheck ||
//            player.needsSpecialSpaceAction;
//   }

//   // Bankruptcy handling
//   private checkBankruptcy(player: PlayerAccount): void {
//     if (player.cashBalance < 0) {
//       player.needsBankruptcyCheck = true;
      
//       this.addLog({
//         type: "bankruptcy",
//         message: `${this.getPlayerName(player.wallet)} has negative cash balance and needs to raise funds`,
//         playerId: player.wallet
//       });
//     }
//   }

//   public declareBankruptcy(playerWallet: Address): { success: boolean; message: string } {
//     const player = this.players.get(playerWallet);
//     if (!player) {
//       return { success: false, message: "Player not found" };
//     }

//     // Mark player as bankrupt
//     player.isBankrupt = true;
//     player.needsBankruptcyCheck = false;

//     // Return all properties to bank
//     const ownedProperties = Array.from(player.propertiesOwned || []);
//     for (const position of ownedProperties) {
//       const property = this.properties.get(position);
//       if (property) {
//         property.owner = null;
//         property.houses = 0;
//         property.hasHotel = false;
//         property.isMortgaged = false;
//       }
//     }

//     player.propertiesOwned = new Uint8Array([]);

//     this.addLog({
//       type: "bankruptcy",
//       message: `${this.getPlayerName(playerWallet)} declared bankruptcy`,
//       playerId: playerWallet
//     });

//     // Check if game should end
//     const activePlayers = Array.from(this.players.values()).filter(p => !p.isBankrupt);
//     if (activePlayers.length <= 1) {
//       this.gameState.gameStatus = GeneratedGameStatus.Finished;
//       if (activePlayers.length === 1) {
//         this.gameState.winner = activePlayers[0].wallet;
//         this.addLog({
//           type: "turn",
//           message: `${this.getPlayerName(activePlayers[0].wallet)} wins the game!`,
//           playerId: activePlayers[0].wallet
//         });
//       }
//     }

//     return { success: true, message: "Bankruptcy declared" };
//   }

//   // Building management
//   public buildHouse(playerWallet: Address, position: number): { success: boolean; message: string } {
//     const player = this.players.get(playerWallet);
//     const property = this.properties.get(position);
//     const propertyData = this.getPropertyData(position);

//     if (!player || !property || !propertyData || propertyData.type !== "property") {
//       return { success: false, message: "Invalid property or player" };
//     }

//     if (property.owner !== playerWallet) {
//       return { success: false, message: "You don't own this property" };
//     }

//     const propData = propertyData as PropertySpace;

//     // Check if player has color group monopoly
//     if (!this.hasColorGroupMonopoly(playerWallet, propData.colorGroup)) {
//       return { success: false, message: "Must own all properties in color group" };
//     }

//     // Check house limits
//     if (property.houses >= MAX_HOUSES_PER_PROPERTY) {
//       return { success: false, message: "Maximum houses already built" };
//     }

//     if (this.gameState.housesRemaining <= 0) {
//       return { success: false, message: "No houses available" };
//     }

//     // Check funds
//     if (player.cashBalance < BigInt(propData.houseCost)) {
//       return { success: false, message: "Insufficient funds" };
//     }

//     // Build house
//     property.houses++;
//     player.cashBalance -= BigInt(propData.houseCost);
//     this.gameState.bankBalance += BigInt(propData.houseCost);
//     this.gameState.housesRemaining--;

//     this.addLog({
//       type: "building",
//       message: `${this.getPlayerName(playerWallet)} built a house on ${propData.name} for $${propData.houseCost}`,
//       details: { position, cost: propData.houseCost, houses: property.houses },
//       playerId: playerWallet
//     });

//     return { success: true, message: `Built house for $${propData.houseCost}` };
//   }

//   public buildHotel(playerWallet: Address, position: number): { success: boolean; message: string } {
//     const player = this.players.get(playerWallet);
//     const property = this.properties.get(position);
//     const propertyData = this.getPropertyData(position);

//     if (!player || !property || !propertyData || propertyData.type !== "property") {
//       return { success: false, message: "Invalid property or player" };
//     }

//     if (property.owner !== playerWallet) {
//       return { success: false, message: "You don't own this property" };
//     }

//     const propData = propertyData as PropertySpace;

//     // Check if player has color group monopoly
//     if (!this.hasColorGroupMonopoly(playerWallet, propData.colorGroup)) {
//       return { success: false, message: "Must own all properties in color group" };
//     }

//     // Check if property has 4 houses
//     if (property.houses !== MAX_HOUSES_PER_PROPERTY) {
//       return { success: false, message: "Must have 4 houses before building hotel" };
//     }

//     if (property.hasHotel) {
//       return { success: false, message: "Hotel already built" };
//     }

//     if (this.gameState.hotelsRemaining <= 0) {
//       return { success: false, message: "No hotels available" };
//     }

//     // Check funds
//     if (player.cashBalance < BigInt(propData.hotelCost)) {
//       return { success: false, message: "Insufficient funds" };
//     }

//     // Build hotel
//     property.hasHotel = true;
//     property.houses = 0; // Houses are returned to bank
//     player.cashBalance -= BigInt(propData.hotelCost);
//     this.gameState.bankBalance += BigInt(propData.hotelCost);
//     this.gameState.hotelsRemaining--;
//     this.gameState.housesRemaining += MAX_HOUSES_PER_PROPERTY; // Return houses to bank

//     this.addLog({
//       type: "building",
//       message: `${this.getPlayerName(playerWallet)} built a hotel on ${propData.name} for $${propData.hotelCost}`,
//       details: { position, cost: propData.hotelCost },
//       playerId: playerWallet
//     });

//     return { success: true, message: `Built hotel for $${propData.hotelCost}` };
//   }

//   // Utility methods
//   private createPropertyAccount(position: number): PropertyAccount {
//     const propertyData = this.getPropertyData(position);
//     if (!propertyData) {
//       throw new Error(`Invalid property position: ${position}`);
//     }

//     return {
//       discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//       position,
//       owner: null,
//       price: propertyData.price,
//       colorGroup: this.getColorGroupFromBoardData(position),
//       propertyType: this.getPropertyTypeFromBoardData(position),
//       houses: 0,
//       hasHotel: false,
//       isMortgaged: false,
//       rentBase: propertyData.type === "property" ? (propertyData as PropertySpace).baseRent : RAILROAD_BASE_RENT,
//       rentWithColorGroup: propertyData.type === "property" ? (propertyData as PropertySpace).rentWithColorGroup : RAILROAD_BASE_RENT * 2,
//       rentWithHouses: propertyData.type === "property" ? [
//         (propertyData as PropertySpace).rentWith1House,
//         (propertyData as PropertySpace).rentWith2Houses,
//         (propertyData as PropertySpace).rentWith3Houses,
//         (propertyData as PropertySpace).rentWith4Houses
//       ] : [RAILROAD_BASE_RENT, RAILROAD_BASE_RENT * 2, RAILROAD_BASE_RENT * 4, RAILROAD_BASE_RENT * 8],
//       rentWithHotel: propertyData.type === "property" ? (propertyData as PropertySpace).rentWithHotel : RAILROAD_BASE_RENT * 16,
//       houseCost: propertyData.type === "property" ? (propertyData as PropertySpace).houseCost : 0,
//       mortgageValue: propertyData.type === "property" ? (propertyData as PropertySpace).mortgageValue : Math.floor(propertyData.price / 2),
//       lastRentPaid: BigInt(0),
//       address: `property${position}address111111111111111111` as Address,
//     };
//   }

//   private getColorGroupFromBoardData(position: number): ColorGroup {
//     const space = this.getBoardSpace(position);
//     if (!space) return ColorGroup.Special;

//     if (space.type === "railroad") return ColorGroup.Railroad;
//     if (space.type === "utility") return ColorGroup.Utility;
//     if (space.type !== "property") return ColorGroup.Special;

//     const colorMap: Record<string, ColorGroup> = {
//       brown: ColorGroup.Brown,
//       lightBlue: ColorGroup.LightBlue,
//       pink: ColorGroup.Pink,
//       orange: ColorGroup.Orange,
//       red: ColorGroup.Red,
//       yellow: ColorGroup.Yellow,
//       green: ColorGroup.Green,
//       darkBlue: ColorGroup.DarkBlue,
//     };

//     return colorMap[(space as PropertySpace).colorGroup] || ColorGroup.Special;
//   }

//   private getPropertyTypeFromBoardData(position: number): PropertyType {
//     const space = this.getBoardSpace(position);
//     if (!space) return PropertyType.Property;

//     switch (space.type) {
//       case "property": return PropertyType.Property;
//       case "railroad": return PropertyType.Railroad;
//       case "utility": return PropertyType.Utility;
//       case "corner": return PropertyType.Corner;
//       case "chance": return PropertyType.Chance;
//       case "community-chest": return PropertyType.CommunityChest;
//       case "tax": return PropertyType.Tax;
//       default: return PropertyType.Property;
//     }
//   }

//   private getPlayerName(wallet: Address): string {
//     // In a real implementation, this would look up player names
//     // For now, return a shortened wallet address
//     return `Player ${wallet.slice(-4)}`;
//   }

//   // Getters for current state
//   public getGameState(): GameAccount {
//     return { ...this.gameState };
//   }

//   public getPlayers(): PlayerAccount[] {
//     return Array.from(this.players.values()).map(p => ({ ...p }));
//   }

//   public getProperties(): PropertyAccount[] {
//     return Array.from(this.properties.values()).map(p => ({ ...p }));
//   }

//   public getGameLogs(): GameLogEntry[] {
//     return [...this.gameLogs];
//   }

//   public getPlayer(wallet: Address): PlayerAccount | null {
//     const player = this.players.get(wallet);
//     return player ? { ...player } : null;
//   }

//   public getProperty(position: number): PropertyAccount | null {
//     const property = this.properties.get(position);
//     return property ? { ...property } : null;
//   }
// }