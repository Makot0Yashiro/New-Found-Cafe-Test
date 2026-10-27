import { pgTable, text, timestamp, integer, serial, doublePrecision, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
export const profiles = pgTable('cafe_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  lat: doublePrecision('lat'), lng: doublePrecision('lng'),
  pay_method: text('pay_method').notNull().default('cash'),
  pay_account: text('pay_account').notNull().default(''),
});
export type OrderLine = {id:string; name:string; cat:string; price:number; qty:number};
export const orders = pgTable('cafe_orders', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => profiles.id),
  request_id: text('request_id').notNull(),
  customer: text('customer').notNull(),
  order_type: text('order_type').notNull(),
  table_no: text('table_no').notNull().default(''),
  payment: text('payment').notNull(),
  note: text('note').notNull().default(''),
  items: jsonb('items').$type<OrderLine[]>().notNull(),
  subtotal_cents: integer('subtotal_cents').notNull(),
  discount_cents: integer('discount_cents').notNull(),
  total_cents: integer('total_cents').notNull(),
  coupon: text('coupon').notNull().default(''),
  status: text('status').notNull().default('Received'),
  status_at: timestamp('status_at', {withTimezone:true}).notNull().defaultNow(),
  dest_lat: doublePrecision('dest_lat'), dest_lng: doublePrecision('dest_lng'),
  address: text('address').notNull().default(''),
  created_at: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
}, t => [uniqueIndex('cafe_order_request').on(t.user_id,t.request_id), index('cafe_order_owner').on(t.user_id,t.created_at)]);
