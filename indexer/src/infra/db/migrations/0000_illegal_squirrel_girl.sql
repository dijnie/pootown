CREATE TYPE "public"."building_type" AS ENUM('House', 'Hotel');--> statement-breakpoint
CREATE TYPE "public"."color_group" AS ENUM('Brown', 'LightBlue', 'Pink', 'Orange', 'Red', 'Yellow', 'Green', 'DarkBlue', 'Railroad', 'Utility', 'Special');--> statement-breakpoint
CREATE TYPE "public"."game_log_type" AS ENUM('move', 'purchase', 'rent', 'card', 'jail', 'bankruptcy', 'turn', 'dice', 'building', 'trade', 'game', 'skip', 'join');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('WaitingForPlayers', 'InProgress', 'Finished');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('Property', 'Street', 'Railroad', 'Utility', 'Corner', 'Chance', 'CommunityChest', 'Tax', 'Beach', 'Festival');--> statement-breakpoint
CREATE TYPE "public"."sync_component" AS ENUM('historical_sync', 'account_listener', 'queue_processor', 'live_sync', 'gap_recovery');--> statement-breakpoint
CREATE TYPE "public"."sync_status_type" AS ENUM('running', 'stopped', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('Pending', 'Accepted', 'Rejected', 'Cancelled', 'Expired');--> statement-breakpoint
CREATE TYPE "public"."trade_type" AS ENUM('MoneyOnly', 'PropertyOnly', 'MoneyForProperty', 'PropertyForMoney');--> statement-breakpoint
CREATE TABLE "auction_states" (
	"pubkey" varchar(44) PRIMARY KEY NOT NULL,
	"game" varchar(44) NOT NULL,
	"property_position" smallint NOT NULL,
	"current_bid" bigint NOT NULL,
	"highest_bidder" varchar(44),
	"started_at" bigint NOT NULL,
	"ends_at" bigint NOT NULL,
	"is_active" boolean NOT NULL,
	"bump" smallint NOT NULL,
	"account_created_at" timestamp with time zone NOT NULL,
	"account_updated_at" timestamp with time zone NOT NULL,
	"created_slot" bigint NOT NULL,
	"updated_slot" bigint NOT NULL,
	"last_signature" varchar(88)
);
--> statement-breakpoint
CREATE TABLE "game_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar(44) NOT NULL,
	"player_id" varchar(44) NOT NULL,
	"player_name" varchar(100),
	"type" "game_log_type" NOT NULL,
	"message" text NOT NULL,
	"property_name" varchar(100),
	"position" smallint,
	"price" bigint,
	"owner" varchar(44),
	"card_type" varchar(20),
	"card_title" varchar(200),
	"card_description" text,
	"card_index" smallint,
	"effect_type" smallint,
	"amount" bigint,
	"trade_id" varchar(44),
	"action" varchar(50),
	"target_player" varchar(44),
	"target_player_name" varchar(100),
	"offered_properties" json,
	"requested_properties" json,
	"offered_money" bigint,
	"requested_money" bigint,
	"from_position" smallint,
	"to_position" smallint,
	"dice_roll" json,
	"doubles_count" smallint,
	"passed_go" boolean,
	"jail_reason" varchar(20),
	"fine_amount" bigint,
	"building_type" varchar(10),
	"tax_type" varchar(50),
	"signature" varchar(88),
	"error" text,
	"slot" bigint,
	"timestamp" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"account_created_at" timestamp with time zone DEFAULT now(),
	"account_updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_states" (
	"pubkey" varchar(44) PRIMARY KEY NOT NULL,
	"game_id" bigint NOT NULL,
	"config_id" varchar(44) NOT NULL,
	"authority" varchar(44) NOT NULL,
	"bump" smallint NOT NULL,
	"max_players" smallint NOT NULL,
	"current_players" smallint NOT NULL,
	"current_turn" smallint NOT NULL,
	"players" json NOT NULL,
	"created_at" bigint NOT NULL,
	"game_status" "game_status" NOT NULL,
	"turn_started_at" bigint NOT NULL,
	"time_limit" bigint,
	"bank_balance" bigint NOT NULL,
	"free_parking_pool" bigint NOT NULL,
	"houses_remaining" smallint NOT NULL,
	"hotels_remaining" smallint NOT NULL,
	"winner" varchar(44),
	"next_trade_id" smallint NOT NULL,
	"account_created_at" timestamp with time zone NOT NULL,
	"account_updated_at" timestamp with time zone NOT NULL,
	"created_slot" bigint NOT NULL,
	"updated_slot" bigint NOT NULL,
	"last_signature" varchar(88)
);
--> statement-breakpoint
CREATE TABLE "platform_configs" (
	"pubkey" varchar(44) PRIMARY KEY NOT NULL,
	"id" varchar(44) NOT NULL,
	"fee_basis_points" smallint NOT NULL,
	"authority" varchar(44) NOT NULL,
	"fee_vault" varchar(44) NOT NULL,
	"total_games_created" bigint DEFAULT 0,
	"next_game_id" bigint DEFAULT 0,
	"bump" smallint NOT NULL,
	"account_created_at" timestamp with time zone NOT NULL,
	"account_updated_at" timestamp with time zone NOT NULL,
	"created_slot" bigint NOT NULL,
	"updated_slot" bigint NOT NULL,
	"last_signature" varchar(88)
);
--> statement-breakpoint
CREATE TABLE "player_states" (
	"pubkey" varchar(44) PRIMARY KEY NOT NULL,
	"wallet" varchar(44) NOT NULL,
	"game" varchar(44) NOT NULL,
	"cash_balance" bigint NOT NULL,
	"net_worth" bigint NOT NULL,
	"position" smallint NOT NULL,
	"in_jail" boolean NOT NULL,
	"jail_turns" smallint NOT NULL,
	"doubles_count" smallint NOT NULL,
	"is_bankrupt" boolean NOT NULL,
	"properties_owned" json NOT NULL,
	"get_out_of_jail_cards" smallint NOT NULL,
	"last_rent_collected" bigint NOT NULL,
	"festival_boost_turns" smallint NOT NULL,
	"has_rolled_dice" boolean NOT NULL,
	"last_dice_roll" json NOT NULL,
	"needs_property_action" boolean NOT NULL,
	"pending_property_position" smallint,
	"needs_chance_card" boolean NOT NULL,
	"needs_community_chest_card" boolean NOT NULL,
	"needs_bankruptcy_check" boolean NOT NULL,
	"needs_special_space_action" boolean NOT NULL,
	"pending_special_space_position" smallint,
	"card_drawn_at" bigint,
	"account_created_at" timestamp with time zone NOT NULL,
	"account_updated_at" timestamp with time zone NOT NULL,
	"created_slot" bigint NOT NULL,
	"updated_slot" bigint NOT NULL,
	"last_signature" varchar(88)
);
--> statement-breakpoint
CREATE TABLE "processing_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_pubkey" varchar(44) NOT NULL,
	"account_type" varchar(30) NOT NULL,
	"account_data" json NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"slot" bigint NOT NULL,
	"signature" varchar(88),
	"status" varchar(20) DEFAULT 'pending',
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "property_states" (
	"pubkey" varchar(44) PRIMARY KEY NOT NULL,
	"position" smallint NOT NULL,
	"game" varchar(44) NOT NULL,
	"owner" varchar(44),
	"price" smallint NOT NULL,
	"color_group" "color_group" NOT NULL,
	"property_type" "property_type" NOT NULL,
	"houses" smallint NOT NULL,
	"has_hotel" boolean NOT NULL,
	"is_mortgaged" boolean NOT NULL,
	"rent_base" smallint NOT NULL,
	"rent_with_color_group" smallint NOT NULL,
	"rent_with_houses" json NOT NULL,
	"rent_with_hotel" smallint NOT NULL,
	"house_cost" smallint NOT NULL,
	"mortgage_value" smallint NOT NULL,
	"last_rent_paid" bigint NOT NULL,
	"init" boolean NOT NULL,
	"account_created_at" timestamp with time zone NOT NULL,
	"account_updated_at" timestamp with time zone NOT NULL,
	"created_slot" bigint NOT NULL,
	"updated_slot" bigint NOT NULL,
	"last_signature" varchar(88)
);
--> statement-breakpoint
CREATE TABLE "sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"component" "sync_component" NOT NULL,
	"last_processed_slot" bigint,
	"last_processed_signature" varchar(88),
	"last_processed_timestamp" bigint,
	"accounts_processed" integer DEFAULT 0,
	"status" "sync_status_type" NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sync_status_component_unique" UNIQUE("component")
);
--> statement-breakpoint
CREATE TABLE "trade_states" (
	"pubkey" varchar(44) PRIMARY KEY NOT NULL,
	"game" varchar(44) NOT NULL,
	"proposer" varchar(44) NOT NULL,
	"receiver" varchar(44) NOT NULL,
	"trade_type" "trade_type" NOT NULL,
	"proposer_money" bigint NOT NULL,
	"receiver_money" bigint NOT NULL,
	"proposer_property" smallint,
	"receiver_property" smallint,
	"status" "trade_status" NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"bump" smallint NOT NULL,
	"account_created_at" timestamp with time zone NOT NULL,
	"account_updated_at" timestamp with time zone NOT NULL,
	"created_slot" bigint NOT NULL,
	"updated_slot" bigint NOT NULL,
	"last_signature" varchar(88)
);
--> statement-breakpoint
CREATE INDEX "idx_auction_states_game" ON "auction_states" USING btree ("game");--> statement-breakpoint
CREATE INDEX "idx_auction_states_property_position" ON "auction_states" USING btree ("property_position");--> statement-breakpoint
CREATE INDEX "idx_auction_states_highest_bidder" ON "auction_states" USING btree ("highest_bidder");--> statement-breakpoint
CREATE INDEX "idx_auction_states_is_active" ON "auction_states" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_auction_states_ends_at" ON "auction_states" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "idx_auction_states_updated_at" ON "auction_states" USING btree ("account_updated_at");--> statement-breakpoint
CREATE INDEX "idx_game_logs_game_id" ON "game_logs" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_game_logs_player_id" ON "game_logs" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_game_logs_type" ON "game_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_game_logs_timestamp" ON "game_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_game_logs_position" ON "game_logs" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_game_logs_created_at" ON "game_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_games_game_id" ON "game_states" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_games_config_id" ON "game_states" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "idx_games_authority" ON "game_states" USING btree ("authority");--> statement-breakpoint
CREATE INDEX "idx_games_status" ON "game_states" USING btree ("game_status");--> statement-breakpoint
CREATE INDEX "idx_games_current_turn" ON "game_states" USING btree ("current_turn");--> statement-breakpoint
CREATE INDEX "idx_games_winner" ON "game_states" USING btree ("winner");--> statement-breakpoint
CREATE INDEX "idx_games_created_at" ON "game_states" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_games_updated_at" ON "game_states" USING btree ("account_updated_at");--> statement-breakpoint
CREATE INDEX "idx_games_composite_status_created" ON "game_states" USING btree ("game_status","created_at");--> statement-breakpoint
CREATE INDEX "idx_platform_authority" ON "platform_configs" USING btree ("authority");--> statement-breakpoint
CREATE INDEX "idx_platform_fee_vault" ON "platform_configs" USING btree ("fee_vault");--> statement-breakpoint
CREATE INDEX "idx_platform_next_game_id" ON "platform_configs" USING btree ("next_game_id");--> statement-breakpoint
CREATE INDEX "idx_platform_updated_at" ON "platform_configs" USING btree ("account_updated_at");--> statement-breakpoint
CREATE INDEX "idx_player_states_wallet" ON "player_states" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "idx_player_states_game" ON "player_states" USING btree ("game");--> statement-breakpoint
CREATE INDEX "idx_player_states_position" ON "player_states" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_player_states_in_jail" ON "player_states" USING btree ("in_jail");--> statement-breakpoint
CREATE INDEX "idx_player_states_is_bankrupt" ON "player_states" USING btree ("is_bankrupt");--> statement-breakpoint
CREATE INDEX "idx_player_states_cash_balance" ON "player_states" USING btree ("cash_balance");--> statement-breakpoint
CREATE INDEX "idx_player_states_updated_at" ON "player_states" USING btree ("account_updated_at");--> statement-breakpoint
CREATE INDEX "idx_player_states_composite_game_wallet" ON "player_states" USING btree ("game","wallet");--> statement-breakpoint
CREATE INDEX "idx_processing_queue_status_created" ON "processing_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_processing_queue_account_pubkey" ON "processing_queue" USING btree ("account_pubkey");--> statement-breakpoint
CREATE INDEX "idx_processing_queue_slot" ON "processing_queue" USING btree ("slot");--> statement-breakpoint
CREATE INDEX "idx_processing_queue_event_type" ON "processing_queue" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_property_states_position" ON "property_states" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_property_states_game" ON "property_states" USING btree ("game");--> statement-breakpoint
CREATE INDEX "idx_property_states_owner" ON "property_states" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "idx_property_states_color_group" ON "property_states" USING btree ("color_group");--> statement-breakpoint
CREATE INDEX "idx_property_states_property_type" ON "property_states" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "idx_property_states_is_mortgaged" ON "property_states" USING btree ("is_mortgaged");--> statement-breakpoint
CREATE INDEX "idx_property_states_updated_at" ON "property_states" USING btree ("account_updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_states_composite_game_position" ON "property_states" USING btree ("game","position");--> statement-breakpoint
CREATE INDEX "idx_sync_status_component" ON "sync_status" USING btree ("component");--> statement-breakpoint
CREATE INDEX "idx_sync_status_status" ON "sync_status" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sync_status_updated_at" ON "sync_status" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_trade_states_game" ON "trade_states" USING btree ("game");--> statement-breakpoint
CREATE INDEX "idx_trade_states_proposer" ON "trade_states" USING btree ("proposer");--> statement-breakpoint
CREATE INDEX "idx_trade_states_receiver" ON "trade_states" USING btree ("receiver");--> statement-breakpoint
CREATE INDEX "idx_trade_states_status" ON "trade_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_trade_states_expires_at" ON "trade_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_trade_states_updated_at" ON "trade_states" USING btree ("account_updated_at");--> statement-breakpoint
CREATE INDEX "idx_trade_states_composite_game_status" ON "trade_states" USING btree ("game","status");