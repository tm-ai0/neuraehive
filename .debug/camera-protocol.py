# v0.7.5 CAMÉRA: head chip + floating menu + VOIR + key C, measured in headed Chrome
# (Playwright, synthetic camera). Output: .debug/camera-pw.json + .debug/camera-pw-*.jpg
import json, statistics, sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from lisible_lib import *

W = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
H = int(sys.argv[2]) if len(sys.argv) > 2 else 800
TAG = sys.argv[3] if len(sys.argv) > 3 else "pw"

LAYOUT = """
  const vis = (e) => { if (e.hidden || e.closest('details:not([open])')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const box = (e) => { const r = e.getBoundingClientRect(); const lab = e.querySelector('.cinerae-midi-label'); return { t: (txt(e) || e.className).slice(0, 20), x: Math.round(r.left), r: Math.round(r.right), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), over: e.scrollWidth > e.clientWidth + 1, labelCut: lab ? lab.scrollWidth > lab.clientWidth : false }; };
  const panel = document.querySelector('.cinerae-panel'); const pr = panel.getBoundingClientRect();
  const head = document.querySelector('.cinerae-head');
  const headKids = [...head.children].filter(e => vis(e) && !e.classList.contains('cinerae-mono') && !e.classList.contains('cinerae-cam-menu'));
  const headItems = headKids.flatMap(e => e.classList.contains('cinerae-seg') ? [...e.children] : [e]).map(box);
  const foot = [...document.querySelectorAll('.cinerae-actions button')].filter(vis).map(box);
  const small = [...document.querySelectorAll('.cinerae-panel button, .cinerae-panel input, .cinerae-panel select, .cinerae-panel summary')]
    .filter(vis).map(e => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || txt(e) || e.className).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter(x => Math.min(x.w, x.h) < 44);
  const overlaps = (items) => { const s = [...items].sort((a, b) => a.x - b.x); const o = []; for (let i = 1; i < s.length; i++) if (s[i].x < s[i-1].r - 1 && Math.abs(s[i].top - s[i-1].top) < 4) o.push(s[i-1].t + '/' + s[i].t); return o; };
  const menu = document.querySelector('.cinerae-cam-menu'); const mr = menu.getBoundingClientRect();
  return { rem: parseFloat(getComputedStyle(document.documentElement).fontSize), panelW: Math.round(pr.width), panelX: Math.round(pr.left),
    headH: Math.round(head.getBoundingClientRect().height), headLines: new Set(headItems.map(i => i.top)).size, head: headItems, headOverlaps: overlaps(headItems),
    footLines: new Set(foot.map(i => i.top)).size, foot, footOverlaps: overlaps(foot), small,
    voirVisible: vis(document.querySelector('.cinerae-voir')), chipVisible: vis(document.querySelector('.cinerae-cam-chip')),
    menuOpen: !menu.hidden, menuBox: menu.hidden ? null : { x: Math.round(mr.left), r: Math.round(mr.right), top: Math.round(mr.top), bottom: Math.round(mr.bottom), inPanel: mr.left >= pr.left && mr.right <= pr.right + 0.5 },
    rawKeys: [...document.querySelectorAll('.cinerae-panel *')].map(e => e.childElementCount ? '' : txt(e)).filter(t => /^(ctl|hint|ui|sw|grp|sec|meta|end|val|opt|cam|fam|var|mat|scene|aide|btn|st|band|lfo|div|mode|teinte)\\./.test(t)) };
"""

STATE = """
  const sw = (root, label) => { const b = [...root.querySelectorAll('button.cinerae-switch')].find(b => txt(b) === label); return b ? b.getAttribute('aria-checked') : null; };
  const menu = document.querySelector('.cinerae-cam-menu'); const vid = menu.querySelector('video');
  const chip = document.querySelector('.cinerae-cam-chip'); const voir = document.querySelector('.cinerae-voir');
  return { voir: voir.getAttribute('aria-pressed'), voirHidden: voir.hidden, sectionRaw: sw(document.querySelector('.cinerae-pro'), 'caméra brute'), menuRaw: sw(menu, 'caméra brute'),
    menuOpen: !menu.hidden, menuChildren: menu.children.length, chipLabel: txt(chip.querySelector('.cinerae-midi-label')), chipAria: chip.getAttribute('aria-label'), chipLinked: chip.dataset.linked, chipHidden: chip.hidden, chipExpanded: chip.getAttribute('aria-expanded'),
    video: vid ? { hasStream: !!vid.srcObject, active: !!(vid.srcObject && vid.srcObject.active), paused: vid.paused, ready: vid.readyState, w: vid.videoWidth, h: vid.videoHeight, mirrored: vid.classList.contains('mirrored'), box: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(vid.getBoundingClientRect()) } : null,
    videosInMenu: menu.querySelectorAll('video').length, panelOpen: document.querySelector('.cinerae-panel').classList.contains('open'), mode: document.querySelector('.cinerae-body').dataset.mode };
"""

# The synthetic camera hands out one MediaStream for every call: a stopped
# track would kill the next start. Clone per call, and name the track like a
# real webcam so the chip's short name is measured on a realistic label.
STUB = """
(() => {
  const prev = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await prev(c);
    if (!(c && c.video)) return s;
    const cl = s.clone();
    for (const t of cl.getVideoTracks()) Object.defineProperty(t, 'label', { value: %r });
    return cl;
  };
})();
"""
LABEL = sys.argv[4] if len(sys.argv) > 4 else "Webcam intégrée"

def main():
    out = {"size": [W, H], "steps": {}}
    with sync_playwright() as p:
        browser, page, errors = launch(p, W, H)
        boot(page, cam_mode="person", devices_stub=STUB % LABEL)
        S = lambda: js(page, STATE)
        L = lambda: js(page, LAYOUT)
        shot = lambda name: page.screenshot(path=str(DBG / f"camera-{TAG}-{name}.jpg"), type="jpeg", quality=82)
        # --- Démo
        js(page, "D.btn('Démo'); await wait(300); return 1")
        out["demo"] = {"layout": L(), "state": S()}
        shot("demo")
        # C in Démo: ignored
        page.keyboard.press("c"); page.wait_for_timeout(400)
        out["demo"]["afterC"] = S()
        # --- Pro
        js(page, "await N.pro(); return 1")
        out["pro"] = {"layout": L(), "state": S()}
        shot("pro")
        # --- sync: VOIR / C / section switch / menu switch, with canvas diffs
        js(page, "await N.go('brancher', 'caméra'); await wait(300); return 1")
        sync = {}
        js(page, "await D.grab('raw0'); return 1")
        sync["s0"] = S()
        js(page, "D.btn('Voir'); await wait(700); await D.grab('raw1'); return 1")
        sync["afterVoir"] = S(); sync["d_off_on_voir"] = js(page, "return D.diff('raw0','raw1')")
        shot("voir-on")
        page.keyboard.press("c"); page.wait_for_timeout(700)
        js(page, "await D.grab('raw2'); return 1")
        sync["afterC"] = S(); sync["d_on_off_c"] = js(page, "return D.diff('raw1','raw2')")
        page.keyboard.press("c"); page.wait_for_timeout(700)
        js(page, "await D.grab('raw3'); return 1")
        sync["afterC2"] = S(); sync["d_off_on_c"] = js(page, "return D.diff('raw2','raw3')")
        js(page, "N.sw('caméra brute', false); await wait(700); await D.grab('raw4'); return 1")
        sync["afterSectionOff"] = S(); sync["d_on_off_section"] = js(page, "return D.diff('raw3','raw4')")
        js(page, "N.sw('caméra brute', true); await wait(400); return 1")
        sync["afterSectionOn"] = S()
        # menu switch
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(500); return 1")
        sync["menuOpened"] = S()
        js(page, "const m=document.querySelector('.cinerae-cam-menu'); [...m.querySelectorAll('button.cinerae-switch')].find(b=>txt(b)==='caméra brute').click(); await wait(500); return 1")
        sync["afterMenuOff"] = S()
        js(page, "const m=document.querySelector('.cinerae-cam-menu'); [...m.querySelectorAll('button.cinerae-switch')].find(b=>txt(b)==='caméra brute').click(); await wait(500); return 1")
        sync["afterMenuOn"] = S()
        # mirror from the menu flips the thumbnail
        js(page, "const m=document.querySelector('.cinerae-cam-menu'); [...m.querySelectorAll('button.cinerae-switch')].find(b=>txt(b)==='sens du geste').click(); await wait(300); return 1")
        sync["afterMenuMirror"] = S()
        js(page, "const m=document.querySelector('.cinerae-cam-menu'); [...m.querySelectorAll('button.cinerae-switch')].find(b=>txt(b)==='sens du geste').click(); await wait(300); return 1")
        sync["afterMenuMirrorBack"] = S()
        # leaving Pro turns the raw camera off
        js(page, "D.btn('Démo'); await wait(300); return 1")
        sync["demoAfterOn"] = S()
        js(page, "await N.pro(); await N.go('brancher', 'caméra'); await wait(300); return 1")
        sync["proBack"] = S()
        out["sync"] = sync
        # --- menu: open, vignette, close outside (panel body), Escape, tap on stage
        menu = {}
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(900); return 1")
        menu["open"] = S(); menu["openLayout"] = L()
        shot("menu")
        # tap inside the panel body but outside the menu: menu closes, panel stays
        page.mouse.click(W - 100, H - 200); page.wait_for_timeout(400)
        menu["afterBodyTap"] = S()
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(500); return 1")
        menu["reopen"] = S()
        page.keyboard.press("Escape"); page.wait_for_timeout(400)
        menu["afterEscape"] = S()
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(500); return 1")
        menu["reopen2"] = S()
        page.mouse.click(200, 300); page.wait_for_timeout(500)
        menu["afterStageTap"] = S()
        js(page, "document.querySelector('.cinerae-edge').click(); await wait(500); return 1")
        menu["panelBack"] = S()
        # camera off: the menu shows the "no camera" line, no video
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(400); const m=document.querySelector('.cinerae-cam-menu'); [...m.querySelectorAll('button.cinerae-switch')].find(b=>txt(b)==='caméra').click(); await wait(1200); return 1")
        menu["camOff"] = S()
        shot("menu-cam-off")
        js(page, "const m=document.querySelector('.cinerae-cam-menu'); [...m.querySelectorAll('button.cinerae-switch')].find(b=>txt(b)==='caméra').click(); await wait(2500); return 1")
        menu["camBackOn"] = S()
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        out["menu"] = menu
        # --- fps: menu closed before, open, closed after (brancher > réglages line)
        js(page, "await N.go('brancher', 'réglages'); await wait(1500); return 1")
        def sample(n=6):
            v = []
            for _ in range(n):
                page.wait_for_timeout(500)
                f = js(page, "return D.fps()")
                if f: v.append(f)
            return v
        fps = {"before": sample()}
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(1500); return 1")
        fps["menuOpen"] = sample()
        page.keyboard.press("Escape"); page.wait_for_timeout(1500)
        fps["after"] = sample()
        for k in ("before", "menuOpen", "after"):
            fps[k + "Median"] = statistics.median([x["fps"] for x in fps[k]]) if fps[k] else None
            fps[k + "K"] = sorted({x["k"] for x in fps[k]})
        out["fps"] = fps
        # --- EN: no raw keys, chip / VOIR translated
        js(page, "D.btn('Aide'); await wait(300); [...document.querySelectorAll('.cinerae-subtabs button')].find(b=>txt(b)==='liens').click(); await wait(300); D.chip('English'); await wait(400); D.btn('Help'); await wait(300); return 1")
        js(page, "document.querySelector('.cinerae-cam-chip').click(); await wait(400); return 1")
        out["en"] = {"layout": L(), "state": S()}
        shot("en-menu")
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
        js(page, "D.btn('Help'); await wait(300); [...document.querySelectorAll('.cinerae-subtabs button')].find(b=>txt(b)==='links').click(); await wait(300); D.chip('Français'); await wait(400); D.btn('Aide'); await wait(300); return 1")
        out["console"] = errors[:20]
        browser.close()
    (DBG / f"camera-{TAG}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("written", DBG / f"camera-{TAG}.json")

main()
