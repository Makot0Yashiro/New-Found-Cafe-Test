import { getUser } from '@netlify/identity';
import { and, desc, eq } from 'drizzle-orm';
import { database } from '../db/index.js';
import { profiles, orders } from '../db/schema.js';
import { InputError, profileInput, orderInput, publicOrder, steps } from './validation.js';

export function createHandler(auth=getUser, connect=database) { return async (req:Request) => {
  const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  try {
    const url=new URL(req.url), path=url.pathname.replace(/\/$/,'');
    if(!['GET','POST','PUT'].includes(req.method)) return json({error:'Method not allowed'},405);
    if(req.method!=='GET') {
      if(req.headers.get('origin')!==url.origin) return json({error:'Request origin not allowed'},403);
      if(!req.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON required'},415);
      if(Number(req.headers.get('content-length')??0)>24000) return json({error:'Request too large'},413);
    }
    const user=await auth();
    if(!user) return json({error:'Please log in to continue.'},401);
    const admin=user.roles?.includes('admin')??false;
    if(path.startsWith('/api/admin')&&!admin) return json({error:'Staff access required.'},403);
    if(path==='/api/session'&&req.method==='GET') return json({id:user.id,email:user.email,name:user.name,is_admin:admin});
    const db=connect();
    const [profile]=await db.insert(profiles).values({id:user.id,name:(user.name||user.email?.split('@')[0]||'Guest').slice(0,60)})
      .onConflictDoUpdate({target:profiles.id,set:{id:user.id}}).returning();
    async function body() {
      const raw=await req.text();
      if(raw.length>24000) throw new InputError('Request too large',413);
      let data;
      try {data=JSON.parse(raw);} catch {throw new InputError('Invalid JSON.');}
      if(!data||Array.isArray(data)||typeof data!=='object') throw new InputError('Invalid request.');
      return data;
    }
    if(path==='/api/account') {
      if(req.method==='GET') return json({...profile,email:user.email});
      if(req.method==='PUT') {
        const update=profileInput(await body());
        const [saved]=await db.update(profiles).set(update).where(eq(profiles.id,user.id)).returning();
        return json({...saved,email:user.email});
      }
      return json({error:'Method not allowed'},405);
    }
    if(path==='/api/orders'&&req.method==='POST') {
      const data=orderInput(await body(),profile);
      const [inserted]=await db.insert(orders).values({...data,user_id:user.id,customer:profile.name})
        .onConflictDoNothing({target:[orders.user_id,orders.request_id]}).returning();
      if(inserted) return json({id:inserted.id},201);
      const [existing]=await db.select().from(orders).where(and(eq(orders.user_id,user.id),eq(orders.request_id,data.request_id)));
      return json({id:existing.id});
    }
    if((path==='/api/orders'||path==='/api/admin/orders')&&req.method==='GET') {
      const rows=await db.select().from(orders).where(path==='/api/admin/orders'?undefined:eq(orders.user_id,user.id)).orderBy(desc(orders.id)).limit(200);
      return json(rows.map(publicOrder));
    }
    const match=path.match(/^\/api\/(admin\/)?orders\/(\d+)\/(track|status)$/);
    if(match) {
      const id=Number(match[2]);
      if(!Number.isSafeInteger(id)||id<1||id>2147483647) throw new InputError('Order not found.',404);
      const allowed=match[1]?eq(orders.id,id):and(eq(orders.id,id),eq(orders.user_id,user.id));
      const [row]=await db.select().from(orders).where(allowed);
      if(!row) return json({error:'Order not found.'},404);
      if(match[3]==='track'&&req.method==='GET') return json(publicOrder(row));
      if(match[3]==='status'&&req.method==='POST'&&match[1]&&admin) {
        const {status}=await body();
        if(![...steps(row.order_type),'Cancelled'].includes(status)) throw new InputError('Invalid order status.');
        const [saved]=await db.update(orders).set({status,status_at:new Date()}).where(eq(orders.id,id)).returning();
        return json(publicOrder(saved));
      }
      return json({error:'Method not allowed'},405);
    }
    return json({error:'Not found.'},404);
  } catch(error) {
    if(error instanceof InputError) return json({error:error.message},error.status);
    // Never expose database errors, connection details, or submitted data.
    return json({error:'The cafe service is temporarily unavailable. Please try again.'},503);
  }
}; }
