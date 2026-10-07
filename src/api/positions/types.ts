/**
 * Types for the Trading Positions & History API (V2).
 */
import type { ModifyPositionRequest } from './modifyPositionWire';

/**
 * Raw position object returned by GET /api/v2/positions/{login}.
 * Represents a single open position on the trading account.
 */
export interface Position {
  ticket: number;
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_open: number;
  price_current: number;
  price_sl?: number | null;
  price_tp?: number | null;
  profit: number;
  swap: number;
  /** Not sent by the v3 gateway; a missing value means 0. */
  commission?: number;
  comment?: string;
  time_create: number;
  time_update: number;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
  /** v3 optimistic-concurrency counter (string). Informational only. */
  state_version?: string | number;
  margin?: number;
  contract_size?: number;
  bid?: number;
  ask?: number;
}

/**
 * Raw closed-position object returned by GET /api/v2/positions/{login}/history.
 * Contains the same fields as an open position plus close-specific metadata.
 */
export interface ClosedPosition {
  ticket: number;
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_open: number;
  price_close?: number;
  price_current?: number;
  price_sl?: number | null;
  price_tp?: number | null;
  profit: number;
  swap: number;
  commission?: number;
  comment?: string;
  time_create: number;
  time_update: number;
  time_close?: number;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
}

/**
 * Response payload from POST /api/v2/positions/{id}/close.
 * The server returns the resulting deal record for the closed position.
 * The position is closed using its **ticket ID** (not account login).
 */
export interface ClosePositionResponse {
  partial?: boolean;
  price_close?: number;
  price_open?: number;
  profit?: number;
  side?: string;
  status?: string;
  swap?: number;
  symbol?: string;
  ticket?: number;
  time?: number;
  volume_closed?: number;
  volume_total?: number;

  /** v3 sends these tickets as STRINGS ("1003"); legacy builds used numbers. */
  order_ticket?: number | string;
  deal_ticket?: number | string;
  state_version?: string;
  client_order_id?: string;
  command_id?: string;
  /** App-local: 409 POSITION_ALREADY_CLOSED was treated as a completed close. */
  already_closed?: boolean;
  /** App-local: a 202 close was confirmed by the positions reconciliation read. */
  confirmed_by?: 'reconciliation';

  // Alternate documented properties
  position_ticket?: number;
  account_login?: number;
  action?: string;
  entry?: string;
  volume?: number;
  price?: number;
  commission?: number;
  fee?: number;
  magic?: number;
  comment?: string;
}

/**
 * Payload for PUT /api/v2/positions/{id} to modify SL/TP on an open position.
 */
export type ModifyPositionPayload = ModifyPositionRequest;

export type JsonRecord = Record<string, unknown>;
