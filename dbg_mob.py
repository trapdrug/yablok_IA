# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args=["--no-sandbox"],
    )
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://127.0.0.1:5173/", wait_until="networkidle", timeout=30000)
    pg.wait_for_timeout(1200)
    pg.screenshot(path="dbg_mob_full.png", full_page=False)
    print("jserrors:", errs)
    print("no-hscroll:", pg.evaluate(
        "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"))
    ctx.close()
    b.close()
print("DONE")
