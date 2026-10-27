import catalog from './menu.json' with { type: 'json' };
import type { OrderLine } from '../db/schema.js';
export class InputError extends Error { constructor(message:string, public status=400) { super(message); } }
export const steps = (type:string) => ['Received','Preparing','Ready',...(type==='delivery'?['Out for delivery','Delivered']:['Completed'])];
export function text(value:unknown, max:number, required=false):string {
  if (typeof value !== 'string' || value.trim().length>max || (required&&!value.trim())) throw new InputError('Please check your details.');
  return value.trim();
}
export function coordinate(value:unknown, limit:number) {
  if(value===null || value==='' || value===undefined) return null;
  const n=Number(value); if(!Number.isFinite(n)||Math.abs(n)>limit) throw new InputError('Choose a valid delivery location.');
  return n;
}
export function profileInput(d:Record<string,unknown>) {
  const lat=coordinate(d.lat,90), lng=coordinate(d.lng,180);
  if((lat===null)!==(lng===null)) throw new InputError('Choose a complete delivery location.');
  if(!['cash','gcash','maya','card'].includes(String(d.pay_method))) throw new InputError('Choose a valid payment method.');
  return {name:text(d.name,60,true),phone:text(d.phone??'',25),address:text(d.address??'',200),lat,lng,pay_method:String(d.pay_method),pay_account:text(d.pay_account??'',25)};
}
export function orderInput(d:Record<string,unknown>, profile:{address:string;lat:number|null;lng:number|null}) {
  if(!Array.isArray(d.items)||!d.items.length||d.items.length>15) throw new InputError('Add items to your order.');
  const seen=new Set<string>(); const items:OrderLine[]=[];
  for(const line of d.items) {
    if(!line || typeof line.id!=='string' || !Object.hasOwn(catalog.items,line.id)) throw new InputError('Invalid menu item.');
    if(seen.has(line.id)||!Number.isInteger(line.qty)||line.qty<1||line.qty>50) throw new InputError('Choose a quantity between 1 and 50.');
    seen.add(line.id);
    const item=catalog.items[line.id as keyof typeof catalog.items];
    items.push({id:item.id,name:item.name,cat:item.cat,price:item.price,qty:line.qty});
  }
  const order_type=text(d.order_type,20,true), payment=text(d.payment,20,true);
  if(!['dine-in','takeaway','delivery'].includes(order_type)) throw new InputError('Choose an order type.');
  if(!['cash','gcash','maya','card'].includes(payment)) throw new InputError('Choose a payment method.');
  const table_no=text(d.table_no??'',10), note=text(d.note??'',200), coupon=text(d.coupon??'',40).toUpperCase();
  if(order_type==='dine-in'&&!table_no) throw new InputError('Enter your table number.');
  if(coupon&&!Object.hasOwn(catalog.coupons,coupon)) throw new InputError('That coupon is not valid.');
  const subtotal_cents=items.reduce((sum,item)=>sum+item.price*100*item.qty,0);
  const discount_cents=Math.round(subtotal_cents*(catalog.coupons[coupon as keyof typeof catalog.coupons]??0));
  const dest_lat=order_type==='delivery'?coordinate(d.dest_lat??profile.lat,90):null;
  const dest_lng=order_type==='delivery'?coordinate(d.dest_lng??profile.lng,180):null;
  if(order_type==='delivery' && (dest_lat===null || dest_lng===null || !profile.address)) throw new InputError('Save your delivery address and map pin in Account first.');
  const request_id=text(d.request_id,36,true);
  if(!/^[a-f0-9-]{36}$/i.test(request_id)) throw new InputError('Invalid order request. Please try again.');
  return {items,order_type,table_no,payment,note,coupon,subtotal_cents,discount_cents,total_cents:subtotal_cents-discount_cents,dest_lat,dest_lng,address:order_type==='delivery'?profile.address:'',request_id};
}
export function publicOrder(row:any) {
  return {id:row.id,customer:row.customer,order_type:row.order_type,table_no:row.table_no,payment:row.payment,note:row.note,
    items:row.items,total:row.total_cents/100,subtotal:row.subtotal_cents/100,discount:row.discount_cents/100,
    coupon:row.coupon,status:row.status,created_at:row.created_at,address:row.address,
    steps:steps(row.order_type),dest:row.dest_lat!==null?[row.dest_lat,row.dest_lng]:null,
    // Only report known locations; no simulated courier movement.
    lat:row.status==='Delivered'?row.dest_lat:catalog.cafe[0],lng:row.status==='Delivered'?row.dest_lng:catalog.cafe[1]};
}
