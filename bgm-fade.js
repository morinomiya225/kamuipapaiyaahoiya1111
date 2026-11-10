// bgm-fade.js
// BGMをループさせず、曲の終わりでフェードアウトして止めるための追加スクリプト。
// ゲーム本体のスクリプトより「前」に読み込んでください。
//   <script src="bgm-fade.js"></script>
//
// ■ iPhone / iPad 対応について
//   iOS では audio.volume を変えても無視されます（いつも最大音量のまま）。
//   そのため、前のバージョンではフェードが効かず、
//   8秒たった瞬間に音がブツッと切れていました。
//   このバージョンでは、音量が効かない端末だけ Web Audio を使って
//   音量を下げるので、iPhone でもちゃんとフェードアウトします。
(function () {
  const PLAY_SEC = 8;    // BGMを何秒流して止めるか（曲がこれより短ければ曲の終わりで止まる）
  const FADE_SEC = 2;    // 止まる前の何秒でフェードアウトするか
  const BGM_MIN_SEC = 4; // これより長い音だけBGMとして扱う（短いSEはそのまま）

  // ===== ここから、音量を変えるためのしくみ =====

  // audio.volume が本当に効くかどうかを1回だけ調べます。
  // パソコンや Android は効きます。iPhone / iPad は効きません。
  let volumeWorks = null;
  function canUseVolume(a) {
    if (volumeWorks !== null) return volumeWorks;
    const keep = a.volume;
    try {
      a.volume = 0.5;
      volumeWorks = Math.abs(a.volume - 0.5) < 0.01;
      a.volume = keep;
    } catch (e) {
      volumeWorks = false;
    }
    return volumeWorks;
  }

  // Web Audio のしくみ。音量が効かない端末のときだけ使います。
  let ctx = null;

  function resumeCtx() {
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(function () {});
    }
  }
  // 画面を触ったときに動かせるようにしておきます
  document.addEventListener("pointerdown", resumeCtx, true);
  document.addEventListener("touchstart", resumeCtx, true);
  document.addEventListener("keydown", resumeCtx, true);

  // この音に対する音量つまみを用意します。
  // 一度つないだら、同じ音には二度つなげません（ブラウザの決まり）。
  function gainOf(a) {
    if (a.__gain !== undefined) return a.__gain;
    a.__gain = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      const src = ctx.createMediaElementSource(a);
      const g = ctx.createGain();
      src.connect(g);
      g.connect(ctx.destination);
      a.__gain = g;
      resumeCtx();
    } catch (e) {
      a.__gain = null;   // 使えなければ、これまで通りの動きに戻ります
    }
    return a.__gain;
  }

  function getVol(a) {
    if (canUseVolume(a)) return a.volume;
    const g = a.__gain;                // まだ用意していなければ 1 とみなします
    return g ? g.gain.value : 1;
  }

  function setVol(a, v) {
    if (canUseVolume(a)) { a.volume = v; return true; }
    const g = gainOf(a);               // ここで初めて Web Audio につなぎます
    if (!g) return false;
    g.gain.value = v;
    return true;
  }

  // ===== ここから、もとの処理 =====

  // ループを無効化（本体が loop = true にしても無視する）
  Object.defineProperty(HTMLMediaElement.prototype, "loop", {
    configurable: true,
    get() { return false; },
    set(_) { /* 無視 */ }
  });

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    this.removeAttribute("loop"); // <audio loop> と書かれていても止める
    if (!this.__fadeHooked) hook(this);
    return origPlay.apply(this, arguments);
  };

  function hook(a) {
    a.__fadeHooked = true;
    a.__baseVol = null;

    const tick = () => {
      if (a.paused || a.ended) return;
      const d = a.duration;
      if (isFinite(d) && d >= BGM_MIN_SEC) {
        const stopAt = Math.min(d, PLAY_SEC);
        const rest = stopAt - a.currentTime;
        if (rest <= 0) {
          a.pause();
          if (a.__baseVol !== null) setVol(a, a.__baseVol);
          a.__baseVol = null;
          return;
        }
        if (rest <= FADE_SEC) {
          if (a.__baseVol === null) a.__baseVol = getVol(a);
          setVol(a, Math.max(0, a.__baseVol * (rest / FADE_SEC)));
        } else if (a.__baseVol !== null) {
          // 頭から再生し直されたら音量を戻す
          setVol(a, a.__baseVol);
          a.__baseVol = null;
        }
      }
      requestAnimationFrame(tick);
    };

    a.addEventListener("play", () => requestAnimationFrame(tick));
    a.addEventListener("ended", () => {
      if (a.__baseVol !== null) {
        setVol(a, a.__baseVol); // 次に同じ曲を流すときのために戻す
        a.__baseVol = null;
      }
    });
  }
})();