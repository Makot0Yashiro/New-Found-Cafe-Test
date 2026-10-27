"""Export the existing cafe pages without starting Flask or opening its database.

Run with the project's Python requirements installed:
    python scripts/export-homepage.py
"""
import ast
import shutil
import runpy
import json
from types import SimpleNamespace
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, DictLoader, ChoiceLoader, StrictUndefined, select_autoescape

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Cafe Test' / 'cafe'
OUTPUT = ROOT / 'public'


def read_gallery():
    """Read only literal gallery data; never import the Flask application."""
    values = {}

    def literal(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return values[node.id]
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            return literal(node.left) + literal(node.right)
        if isinstance(node, ast.List):
            return [literal(item) for item in node.elts]
        if isinstance(node, ast.Dict):
            return {literal(key): literal(value) for key, value in zip(node.keys, node.values)}
        raise ValueError('Gallery data must contain literal values.')

    tree = ast.parse((SOURCE / 'blueprints' / 'main.py').read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ('CDN', 'GALLERY'):
                    values[target.id] = literal(node.value)
    return values['GALLERY']


def url_for(endpoint, **kwargs):
    if endpoint == 'static':
        return '/static/' + kwargs['filename']
    return {
        'main.home': '/',
        'menu.menu': '/menu',
        'account.account': '/account',
        'orders.your_order': '/your-order',
        'auth.login': '/login', 'auth.register': '/register', 'auth.logout': '/logout',
        'admin.dashboard': '/admin', 'admin.orders_page': '/admin/orders',
    }[endpoint]


def main():
    menu = runpy.run_path(str(SOURCE / 'menu_data.py'))
    base = (SOURCE / 'templates/base.html').read_text()
    base = base.replace('</body>', '<script type="module" src="/static/js/app.js"></script></body>')
    overrides = {'base.html': base}
    for name in ('menu', 'account'):
        text = (SOURCE / f'templates/{name}.html').read_text()
        text = text.replace('<script>', '<script type="module">\nimport { ready, api, initAccount, placeOrder } from "/static/js/app.js";\nawait ready;')
        if name == 'menu':
            text = text.replace('const me = {{ me|tojson }}', 'const me = await api("/api/account")')
            begin = text.index("$('place').onclick = async () => {")
            finish = text.index('};', begin) + 2
            # Replace the entire final handler, including delivery and response logic.
            finish = text.rindex('};') + 2
            text = text[:begin] + "$('place').onclick = () => placeOrder(cart, me);" + text[finish:]
            begin = text.index('const getPos =')
            finish = text.index("$('place').onclick", begin)
            text = text[:begin] + text[finish:]
            text = text.replace("No saved location — we'll ask for your browser location. You can save one in Account.", "Delivery uses your saved address and map pin. Update them in Account before ordering.")
            text = text.replace('<button class="btn full" id="place">', '<small>Payment is arranged with the cafe. Selecting a method does not charge you.</small><button class="btn full" id="place">')
        else:
            text = text.replace('const cafe =', 'await initAccount();\nconst cafe =')
        text = text.replace('await ready;', 'await ready;\ntry {')
        text = text.replace('</script>', '} catch (error) { const notice = document.createElement("p"); notice.className = "flash"; notice.setAttribute("role", "alert"); notice.textContent = error.message || "Please reload and try again."; document.querySelector("main").prepend(notice); }\n</script>') if name == 'menu' else text.replace('await ready;\ntry {', 'await ready;')
        overrides[f'{name}.html'] = text
    environment = Environment(
        loader=ChoiceLoader([DictLoader(overrides), FileSystemLoader(SOURCE / 'templates')]),
        autoescape=select_autoescape(['html']), undefined=StrictUndefined,
        keep_trailing_newline=True,
    )
    context = dict(url_for=url_for, csrf_token='', current_user=None, is_admin=False,
                   get_flashed_messages=lambda: [], cafe=menu['CAFE_LOCATION'], groups=menu['GROUPS'],
                   me=dict(name='', email='', phone='', address='', lat=None, lng=None, pay_method='cash', pay_account=''),
                   pay={'cash':'Cash','gcash':'GCash','maya':'Maya','card':'Credit / debit card'})
    OUTPUT.mkdir(exist_ok=True)
    html = environment.get_template('home.html').render(gallery=read_gallery(), **context)
    html = html.replace('</body>', '<script type="module" src="/static/js/app.js"></script></body>')
    (OUTPUT / 'index.html').write_text(html)
    for path, template, mode, endpoint in [
        ('login','auth','login','auth.login'), ('register','auth','register','auth.register'),
        ('menu','menu','','menu.menu'), ('account','account','','account.account')]:
        context['request'] = SimpleNamespace(endpoint=endpoint, args={})
        rendered = environment.get_template(template + '.html').render(mode=mode, **context)
        (OUTPUT / f'{path}.html').write_text(rendered)
    for path, admin in [('your-order',False), ('admin',True)]:
        context['request'] = SimpleNamespace(endpoint='orders.your_order', args={})
        template = '{% extends "base.html" %}{% block content %}<p class="eyebrow"><i></i><b></b>' + ('Staff' if admin else 'Live status') + '</p><h1>' + ('Manage Orders' if admin else 'Your Order') + '</h1><p class="lead">' + ('Review customer orders and update their preparation status.' if admin else 'Follow your order from our kitchen to your table or doorstep.') + '</p><div id="orders" aria-live="polite"><p>Loading orders…</p></div>{% endblock %}'
        (OUTPUT / f'{path}.html').write_text(environment.from_string(template).render(**context))
    shutil.copytree(SOURCE / 'static', OUTPUT / 'static', dirs_exist_ok=True)
    # This is the public menu catalogue, not user or order storage.
    (ROOT / 'server/menu.json').write_text(json.dumps({'items':menu['ITEMS'], 'coupons':menu['COUPONS'], 'cafe':menu['CAFE_LOCATION']}))
    print('Exported the original pages and static assets for Netlify.')


if __name__ == '__main__':
    main()
