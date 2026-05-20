/* Ring Light — application logic.
   Vanilla JS, no build step. Designed to run offline as an installed PWA. */
(function () {
  "use strict";

  // ---- Constants ----------------------------------------------------------
  var KMIN = 2000, KMAX = 7000;   // color-temperature range (kelvin)
  var EDGE = 24;                  // px dead-zone so edge swipes stay with the OS
  var IDLE_MS = 3500;             // controls auto-hide delay
  var DRAG_THRESHOLD = 8;         // px before a drag is distinguished from a tap
  var STORE_KEY = "ring-light:settings";
  var HINT_KEY = "ring-light:hint-seen";

  var defaults = {
    intensity: 85,
    mode: "white",        // "white" (kelvin) | "color" (hue/saturation)
    kelvin: 4800,
    hue: 0,
    sat: 100,
    shape: "ring",        // "ring" | "flood"
    radius: 72,
    thickness: 18,
    softness: 35,
    bg: "#000000"
  };

  // ---- State --------------------------------------------------------------
  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return assign({}, defaults);
      var saved = JSON.parse(raw);
      return assign(assign({}, defaults), saved);
    } catch (e) {
      return assign({}, defaults);
    }
  }

  var saveTimer = null;
  function saveState() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch (e) { /* private mode / quota — settings just won't persist */ }
    }, 250);
  }

  // ---- Small helpers ------------------------------------------------------
  function assign(target, src) {
    for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k]; }
    return target;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function $(id) { return document.getElementById(id); }

  // ---- Color math ---------------------------------------------------------
  // Tanner Helland's blackbody approximation: kelvin -> [r,g,b] in 0..255.
  function kelvinToRGB(kelvin) {
    var t = kelvin / 100, r, g, b;
    if (t <= 66) r = 255;
    else r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661;
    else g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  }

  function hslToRGB(h, s, l) {
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  // Final emitted color: base hue/temperature dimmed by intensity toward black.
  function ringColor() {
    var base = state.mode === "white"
      ? kelvinToRGB(state.kelvin)
      : hslToRGB(state.hue, state.sat, 50);
    var f = state.intensity / 100;
    return "rgb(" + Math.round(base[0] * f) + "," +
                    Math.round(base[1] * f) + "," +
                    Math.round(base[2] * f) + ")";
  }

  // ---- Element references -------------------------------------------------
  var light = $("light");
  var controls = $("controls");
  var hud = $("hud");
  var ringOnly = $("ringOnly");

  var el = {
    intensity: $("intensity"), kelvin: $("kelvin"), hue: $("hue"),
    sat: $("sat"), radius: $("radius"), thickness: $("thickness"),
    softness: $("softness"), bg: $("bg")
  };
  var out = {
    intensity: $("intensityOut"), kelvin: $("kelvinOut"), hue: $("hueOut"),
    sat: $("satOut"), radius: $("radiusOut"), thickness: $("thicknessOut"),
    softness: $("softnessOut")
  };

  // ---- Render -------------------------------------------------------------
  // Pushes state into the DOM. Geometry goes to CSS custom properties so the
  // browser recomputes the gradient with no layout reflow.
  function render() {
    light.style.setProperty("--ring-color", ringColor());
    light.style.setProperty("--radius", state.radius);
    light.style.setProperty("--thick", state.thickness);
    light.style.setProperty("--soft", state.softness);
    light.classList.toggle("flood", state.shape === "flood");
    document.body.style.background = state.bg;
    syncControls();
  }

  // Reflects state back onto the controls (used on load, reset, and drags).
  function syncControls() {
    el.intensity.value = state.intensity;
    el.kelvin.value = state.kelvin;
    el.hue.value = state.hue;
    el.sat.value = state.sat;
    el.radius.value = state.radius;
    el.thickness.value = state.thickness;
    el.softness.value = state.softness;
    el.bg.value = state.bg;

    out.intensity.textContent = state.intensity + "%";
    out.kelvin.textContent = state.kelvin + " K";
    out.hue.textContent = state.hue + "°";
    out.sat.textContent = state.sat + "%";
    out.radius.textContent = state.radius + "%";
    out.thickness.textContent = state.thickness + "%";
    out.softness.textContent = state.softness + "%";

    setPressed("modeWhite", state.mode === "white");
    setPressed("modeColor", state.mode === "color");
    setPressed("shapeRing", state.shape === "ring");
    setPressed("shapeFlood", state.shape === "flood");

    $("rowKelvin").classList.toggle("hidden", state.mode !== "white");
    $("rowHue").classList.toggle("hidden", state.mode !== "color");
    $("rowSat").classList.toggle("hidden", state.mode !== "color");
    ringOnly.classList.toggle("hidden", state.shape !== "ring");
  }

  function setPressed(id, on) {
    $(id).setAttribute("aria-pressed", on ? "true" : "false");
  }

  function commit() { render(); saveState(); resetIdle(); }

  // ---- Controls wiring ----------------------------------------------------
  function bindSlider(input, key, transform) {
    input.addEventListener("input", function () {
      var v = parseInt(input.value, 10);
      state[key] = transform ? transform(v) : v;
      commit();
    });
  }
  bindSlider(el.intensity, "intensity");
  bindSlider(el.kelvin, "kelvin");
  bindSlider(el.hue, "hue");
  bindSlider(el.sat, "sat");
  bindSlider(el.radius, "radius");
  bindSlider(el.thickness, "thickness");
  bindSlider(el.softness, "softness");

  el.bg.addEventListener("input", function () {
    state.bg = el.bg.value;
    commit();
  });

  $("modeWhite").addEventListener("click", function () { state.mode = "white"; commit(); });
  $("modeColor").addEventListener("click", function () { state.mode = "color"; commit(); });
  $("shapeRing").addEventListener("click", function () { state.shape = "ring"; commit(); });
  $("shapeFlood").addEventListener("click", function () { state.shape = "flood"; commit(); });

  $("resetBtn").addEventListener("click", function () {
    state = assign({}, defaults);
    commit();
  });

  // ---- Idle auto-hide of the controls ------------------------------------
  var idleTimer = null;
  var hintOpen = false;

  function showControls() {
    controls.classList.remove("hidden");
    controls.inert = false;
    resetIdle();
  }
  function hideControls() {
    if (document.activeElement && controls.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    controls.classList.add("hidden");
    controls.inert = true;
  }
  function toggleControls() {
    if (controls.classList.contains("hidden")) showControls();
    else { hideControls(); if (idleTimer) clearTimeout(idleTimer); }
  }
  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    if (hintOpen) return;
    idleTimer = setTimeout(hideControls, IDLE_MS);
  }

  // Mouse movement reveals the controls; touch uses tap (see gestures below).
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "mouse" && controls.classList.contains("hidden")) showControls();
  });
  // Any key wakes the UI so keyboard users can always reach the controls.
  window.addEventListener("keydown", function () {
    if (controls.classList.contains("hidden")) showControls();
    else resetIdle();
    requestWakeLock();
  });
  controls.addEventListener("pointerdown", resetIdle);

  // ---- Drag gestures on the light ----------------------------------------
  // Vertical drag = intensity, horizontal = temperature/hue. Axis locks on
  // first significant movement. A drag that never crosses the threshold is
  // treated as a tap and toggles the controls.
  var drag = null;
  var hudTimer = null;

  function showHud(text) {
    hud.textContent = text;
    hud.classList.add("show");
    if (hudTimer) clearTimeout(hudTimer);
  }
  function hideHudSoon() {
    if (hudTimer) clearTimeout(hudTimer);
    hudTimer = setTimeout(function () { hud.classList.remove("show"); }, 650);
  }

  light.addEventListener("pointerdown", function (e) {
    if (!e.isPrimary || drag) return;
    // Ignore drags starting at the screen edge — leave those to the OS.
    if (e.clientX < EDGE || e.clientY < EDGE ||
        e.clientX > window.innerWidth - EDGE ||
        e.clientY > window.innerHeight - EDGE) return;
    drag = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, moved: false,
      i0: state.intensity, k0: state.kelvin, h0: state.hue
    };
    try { light.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    requestWakeLock();
  });

  light.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;

    if (!drag.axis) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      drag.moved = true;
    }

    if (drag.axis === "y") {
      // Drag up brightens.
      state.intensity = Math.round(clamp(drag.i0 - dy / window.innerHeight * 100, 0, 100));
      showHud("Intensity " + state.intensity + "%");
    } else if (state.mode === "white") {
      var k = clamp(drag.k0 + dx / window.innerWidth * (KMAX - KMIN), KMIN, KMAX);
      state.kelvin = Math.round(k / 50) * 50;
      showHud(state.kelvin + " K");
    } else {
      var h = (drag.h0 + dx / window.innerWidth * 360) % 360;
      if (h < 0) h += 360;
      state.hue = Math.round(h);
      showHud("Hue " + state.hue + "°");
    }
    render();
    saveState();
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var tapped = !drag.moved;
    drag = null;
    hideHudSoon();
    if (tapped) toggleControls();
    else resetIdle();
  }
  light.addEventListener("pointerup", endDrag);
  light.addEventListener("pointercancel", endDrag);
  light.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---- Screen Wake Lock ---------------------------------------------------
  // Keeps the display awake while the app is the active light source.
  var wakeLock = null;
  function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      lock.addEventListener("release", function () { wakeLock = null; });
    }).catch(function () { /* denied or unsupported — degrade silently */ });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") requestWakeLock();
  });

  // ---- Fullscreen ---------------------------------------------------------
  var fsBtn = $("fullscreenBtn");
  if (!document.fullscreenEnabled) {
    // iPhone Safari has no Fullscreen API; the install hint covers it instead.
    fsBtn.classList.add("hidden");
  } else {
    fsBtn.addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(function () {});
    });
    document.addEventListener("fullscreenchange", function () {
      fsBtn.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
    });
  }

  // ---- First-run hint -----------------------------------------------------
  function maybeShowHint() {
    var seen;
    try { seen = localStorage.getItem(HINT_KEY); } catch (e) { seen = null; }
    if (seen) { resetIdle(); requestWakeLock(); return; }

    // iOS Safari (not yet installed) exposes navigator.standalone === false.
    if (navigator.standalone === false) $("hintIOS").hidden = false;

    hintOpen = true;
    $("hint").hidden = false;
    $("hintOk").addEventListener("click", function () {
      $("hint").hidden = true;
      hintOpen = false;
      try { localStorage.setItem(HINT_KEY, "1"); } catch (e) {}
      resetIdle();
      requestWakeLock();
    });
  }

  // ---- Service worker -----------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        /* offline support unavailable — app still works online */
      });
    });
  }

  // ---- Boot ---------------------------------------------------------------
  render();
  requestAnimationFrame(function () { light.classList.add("ready"); });
  maybeShowHint();
})();
