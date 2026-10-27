import { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite } from '@netlify/identity';

const $ = id => document.getElementById(id);
const pagePath=location.pathname.replace(/\/$/,'').replace(/\.html$/,'');
const protectedPage = ['/menu','/account','/your-order','/admin','/admin/orders'].includes(pagePath);
function message(text, parent=document.querySelector('main')||document.body) {
  let box=parent.querySelector('[data-message]');
  if(!box) {box=document.createElement('p');box.className='flash';box.dataset.message='';box.setAttribute('role','status');parent.prepend(box);}
  box.textContent=text;
}
function safeNext() {
  const next=new URLSearchParams(location.search).get('next');
  return ['/menu','/account','/your-order','/admin','/admin/orders'].includes(next)?next:'/menu';
}
export async function api(path,options={}) {
  await getUser(); // Refresh the Identity session before sending its cookie.
  const response=await fetch(path,{...options,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  let body;
  try {body=await response.json();} catch {throw new Error('The cafe service could not respond. Please try again.');}
  if(!response.ok) {
    if(response.status===401 && protectedPage) location.assign('/login?next='+encodeURIComponent(location.pathname));
    throw new Error(body.error||'Please try again.');
  }
  return body;
}
function passwordForm(kind,token) {
  const main=document.querySelector('main')||document.body.appendChild(document.createElement('main'));
  const form=document.createElement('form');form.className='card narrow';
  form.innerHTML='<h1 style="font-size:2.2rem">Set your password</h1><label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label><button class="btn full">Save password</button>';
  main.replaceChildren(form);
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try {const password=form.elements.password.value; if(kind==='invite') await acceptInvite(token,password); else await updateUser({password});location.assign('/account');}
    catch(error){message(error.message,form);button.disabled=false;}
  };
}
async function boot() {
  try {
    const callback=await handleAuthCallback();
    if(callback?.type==='recovery'||callback?.type==='invite') {passwordForm(callback.type,callback.token);return new Promise(()=>{});}
    if(callback?.type==='confirmation'||callback?.type==='oauth') {location.replace(safeNext());return null;}
    if(callback?.type==='email_change') message('Your email address has been confirmed.');
    const user=await getUser();
    if(protectedPage&&!user) {location.replace('/login?next='+encodeURIComponent(location.pathname));return new Promise(()=>{});}
    const nav=document.querySelector('.top nav');
    if(user&&nav) {
      const link=nav.querySelector('a[href="/login"]');
      if(link) {const button=document.createElement('button');button.type='button';button.textContent='Logout';link.replaceWith(button);
        button.onclick=async()=>{button.disabled=true;try {await logout();location.assign('/');}catch(error){message(error.message);button.disabled=false;}};}
      if(user.roles?.includes('admin')) {const link=document.createElement('a');link.href='/admin';link.textContent='Admin';nav.append(link);}
    }
    if(location.pathname.startsWith('/admin')&&!user?.roles?.includes('admin')) {
      document.querySelector('main').replaceChildren(Object.assign(document.createElement('p'),{className:'flash',textContent:'Staff access is required. Your account needs the admin role.'}));
      return new Promise(()=>{});
    }
    const path=pagePath;
    if(path==='/login'||path==='/register') setupAuth(path==='/register');
    if($('orders')) setupOrders(path.startsWith('/admin')).catch(error=>message(error.message,$('orders')));
    return user;
  } catch(error) {
    message(error.message||'Sign-in is temporarily unavailable. Please try again.');
    return new Promise(()=>{});
  }
}
export const ready=boot();

function setupAuth(register) {
  const form=document.querySelector('main form');
  form.elements.password.minLength=register?8:1;
  form.elements.password.autocomplete=register?'new-password':'current-password';
  form.elements.email.autocomplete='email';
  const next=safeNext();
  const switchLink=form.querySelector('a');if(switchLink)switchLink.href+=(switchLink.href.includes('?')?'&':'?')+'next='+encodeURIComponent(next);
  form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('button[type=submit],button');button.disabled=true;const label=button.textContent;button.textContent=register?'Creating account…':'Signing in…';
    try {
      if(register) {await signup(form.elements.email.value,form.elements.password.value,{full_name:form.elements.name.value});
        if(await getUser()) location.assign(next);
        else {message('Check your email and follow the confirmation link to finish creating your account.',form);form.elements.password.value='';}
      } else {await login(form.elements.email.value,form.elements.password.value);location.assign(next);}
    } catch(error) {message(error.message||'Could not sign in. Please try again.',form);}
    finally {button.disabled=false;button.textContent=label;}
  };
  if(!register) {
    const forgot=document.createElement('button');forgot.type='button';forgot.className='btn small ghost';forgot.textContent='Forgot password?';form.append(forgot);
    forgot.onclick=async()=>{const email=form.elements.email;if(!email.value||!email.checkValidity()){email.required=true;email.reportValidity();return;}
      forgot.disabled=true;try{await requestPasswordRecovery(email.value);message('If an account exists for this email, a password reset link is on its way.',form);}catch{message('Could not request a reset. Please try again.',form);}finally{forgot.disabled=false;}};
  }
}

export async function initAccount() {
  try {
    const profile=await api('/api/account');
    const form=document.querySelector('main form');
    for(const [key,value] of Object.entries(profile)) {const input=form.elements.namedItem(key);if(input)input.value=value??'';}
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button:not([type=button])');button.disabled=true;
      try {
        const data=Object.fromEntries(new FormData(form));
        await api('/api/account',{method:'PUT',body:JSON.stringify(data)});
        if(data.email!==profile.email) {await updateUser({email:data.email});message('Details saved. Check your email to confirm your new email address.',form);}
        else message('Your account has been saved.',form);
      } catch(error){message(error.message,form);} finally{button.disabled=false;}
    };
    return profile;
  } catch(error) {message(error.message);throw error;}
}

let pendingOrder=null;
export async function placeOrder(cart,me) {
  const button=$('place'), errorBox=$('err');if(button.disabled)return;
  errorBox.hidden=true;button.disabled=true;button.textContent='Placing order…';
  try {
    const items=Object.entries(cart).map(([id,c])=>({id,qty:c.qty}));
    if(!items.length)throw new Error('Add something to your order first.');
    const body={items,order_type:$('otype').value,table_no:$('table').value,payment:$('pay').value,coupon:$('coupon').value,note:$('note').value};
    if(body.order_type==='delivery') {
      if(!me.address||me.lat==null||me.lng==null)throw new Error('Save your delivery address and map pin in Account first.');
      body.dest_lat=me.lat;body.dest_lng=me.lng;
    }
    const signature=JSON.stringify(body);
    if(!pendingOrder||pendingOrder.signature!==signature)pendingOrder={signature,id:crypto.randomUUID()};
    body.request_id=pendingOrder.id;
    const order=await api('/api/orders',{method:'POST',body:JSON.stringify(body)});
    location.assign('/your-order?order='+order.id);
  } catch(error){errorBox.hidden=false;errorBox.setAttribute('role','alert');errorBox.textContent=error.message;}
  finally{button.disabled=false;button.textContent='Place order';}
}

function element(tag,text,className) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
async function setupOrders(admin) {
  const root=$('orders');const prefix=admin?'/api/admin/orders':'/api/orders';
  const refresh=element('button','Refresh orders','btn small ghost');refresh.type='button';root.before(refresh);
  const list=element('section');root.replaceChildren(list);
  let loading=false;
  async function load(){
    if(loading)return;loading=true;refresh.disabled=true;
    try {
      const orders=await api(prefix);list.replaceChildren();
      if(!orders.length){list.append(element('p',admin?'No orders yet.':"You haven’t ordered yet.",'lead'));if(!admin){const a=element('a','Browse the menu','btn');a.href='/menu';list.append(a);}return;}
      for(const order of orders) {
        const card=element('div',undefined,'card order');card.dataset.id=order.id;
        const heading=element('div',undefined,'row');heading.style.cssText='display:flex;justify-content:space-between;gap:1rem';
        heading.append(element('h2','Order #'+order.id),element('span',order.status,'badge'));card.append(heading);
        card.append(element('small',[admin?order.customer:null,new Date(order.created_at).toLocaleString(),order.order_type,order.table_no?'Table '+order.table_no:null,order.payment].filter(Boolean).join(' · ')));
        const lines=element('ul');for(const item of order.items)lines.append(element('li',`${item.qty} × ${item.name}`));card.append(lines);
        card.append(element('p','Total: ₱'+order.total.toFixed(2)));
        if(order.discount)card.append(element('small',`${order.coupon}: ₱${order.discount.toFixed(2)} discount applied`));
        if(order.note)card.append(element('p','Note: '+order.note));
        if(order.address)card.append(element('p','Delivery address: '+order.address));
        const stages=element('ol',undefined,'steps');for(const [i,step] of order.steps.entries())stages.append(element('li',step,i<=order.steps.indexOf(order.status)?'done':''));card.append(stages);
        if(order.order_type==='delivery')card.append(element('small','Status reflects cafe updates. Live courier GPS is not available.'));
        if(admin){const select=element('select');for(const status of [...order.steps,'Cancelled']){const option=element('option',status);option.value=status;option.selected=status===order.status;select.append(option);}const button=element('button','Update status','btn small');button.type='button';card.append(select,button);
          button.onclick=async()=>{button.disabled=true;try{await api(prefix+'/'+order.id+'/status',{method:'POST',body:JSON.stringify({status:select.value})});await load();}catch(error){message(error.message,card);}finally{button.disabled=false;}};
        }
        list.append(card);
      }
    } catch(error){message(error.message,list);}
    finally{loading=false;refresh.disabled=false;}
  }
  refresh.onclick=load;await load();
  // Staff can edit a status without a polling refresh replacing their selection.
  if(!admin){const timer=setInterval(()=>{if(!document.hidden)load();},10000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});}
}
