import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as mpHolistic from "@mediapipe/holistic";
import * as cam from "@mediapipe/camera_utils";

const NOTES = ["C", "D", "E", "F", "G", "A", "B", "C"];
const MAJOR = [261.63,293.66,329.63,349.23,392.00,440.00,493.88,523.25];
const MINOR = [261.63,293.66,311.13,349.23,392.00,415.30,493.88,523.25];

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const visRef = useRef(null);

  const [pitchSlider, setPitchSlider] = useState(1);
  const [activeNote, setActiveNote] = useState(null);

  const audioCtx = useRef(null);
  const gain = useRef(null);
  const osc = useRef(null);
  const analyser = useRef(null);
  const anim = useRef(null);

  useEffect(() => {
    // setup audio
    audioCtx.current = new (window.AudioContext||window.webkitAudioContext)();
    gain.current = audioCtx.current.createGain();
    gain.current.connect(audioCtx.current.destination);
    analyser.current = audioCtx.current.createAnalyser();
    gain.current.connect(analyser.current);
    analyser.current.fftSize = 64;

    const resume = () => {
      if (audioCtx.current.state === "suspended") audioCtx.current.resume();
      document.removeEventListener("click", resume);
    };
    document.addEventListener("click", resume);

    // visualizer draw
    const drawVis = () => {
      const canvas = visRef.current, ctx = canvas.getContext("2d");
      const buf = new Uint8Array(analyser.current.frequencyBinCount);
      const loop = () => {
        anim.current = requestAnimationFrame(loop);
        analyser.current.getByteFrequencyData(buf);
        ctx.fillStyle = "#000"; ctx.clearRect(0,0,canvas.width,canvas.height);
        const w = canvas.width / buf.length; let x = 0;
        buf.forEach(v => {
          ctx.fillStyle = "lime";
          ctx.fillRect(x, canvas.height - v, w, v);
          x += w + 1;
        });
      };
      loop();
    };
    drawVis();

    const holistic = new mpHolistic.Holistic({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}`
    });
    holistic.setOptions({ modelComplexity:1, smoothLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
    holistic.onResults(onResults);

    if (webcamRef.current) {
      const camera = new cam.Camera(webcamRef.current.video, {
        onFrame: async () => await holistic.send({ image: webcamRef.current.video }),
        width:640,height:480
      });
      camera.start();
    }

    return () => { cancelAnimationFrame(anim.current); if (osc.current) osc.current.stop(); }
  }, []);

  const play = (f, vol, det) => {
    if (!audioCtx.current) return;
    if (osc.current) { osc.current.stop(); osc.current.disconnect(); }
    osc.current = audioCtx.current.createOscillator();
    osc.current.type = "sine";
    osc.current.frequency.setValueAtTime(f, audioCtx.current.currentTime);
    osc.current.detune.linearRampToValueAtTime(det, audioCtx.current.currentTime+0.1);
    gain.current.gain.linearRampToValueAtTime(vol, audioCtx.current.currentTime+0.1);
    osc.current.connect(gain.current);
    osc.current.start();
  };
  const stop = () => {
    if (osc.current) { osc.current.stop(); osc.current.disconnect(); osc.current = null; }
  };

  const onResults = (res) => {
    const canvas = canvasRef.current, ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.save();

    if (res.faceLandmarks && res.rightHandLandmarks) {
      // draw mesh
      res.faceLandmarks.forEach(p => {
        ctx.beginPath();
        ctx.arc(canvas.width - p.x*canvas.width, p.y*canvas.height, 1.5,0,2*Math.PI);
        ctx.fillStyle="cyan"; ctx.fill();
      });

      // mouth open
      const ul = res.faceLandmarks[13], ll = res.faceLandmarks[14];
      const mouth = Math.abs(ll.y - ul.y);
      const volume = Math.min(Math.max((mouth - 0.02)*50, 0),1);

      const tilt = (res.faceLandmarks[234].y - res.faceLandmarks[454].y)*100;

      // eyebrows: take left brow upper vs eye
      const brow = res.faceLandmarks[70].y - res.faceLandmarks[159].y;
      const isRaised = brow < -0.02; // eyebrow higher = smaller Y

      const scale = isRaised ? MAJOR : MINOR;

      // hand average Y
      const h = res.rightHandLandmarks;
      const hy = (h[0].y + h[5].y + h[9].y + h[13].y + h[17].y)/5;
      const section = Math.min(NOTES.length-1, Math.floor((hy*canvas.height)/(canvas.height/NOTES.length)));
      const freq = scale[section]*pitchSlider;
      setActiveNote(NOTES[section]);

      if (volume>0.05) play(freq, volume, tilt);
      else stop();

      // draw sections
      const sh = canvas.height/NOTES.length;
      ctx.strokeStyle="#444"; ctx.fillStyle="#fff"; ctx.font="14px Arial";
      NOTES.forEach((n,i) => {
        const y = i*sh;
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
        ctx.fillText(NOTES[i],10,y+14);
      });
    }
    ctx.restore();
  };

  return (
    <div style={{ textAlign:"center",background:"#111",color:"#fff",height:"100vh" }}>
      <h2>🎵 Humanotone 🎵</h2>
      <p>
        To begin, lift your right hand into the camera and open your mouth. Make sure your <strong>camera</strong> is enabled to enjoy hands-free music control!
        <strong> Raise or lower your eyebrows</strong> to switch between major/minor tones.
        <strong> Open your mouth</strong> wider to increase the volume.
        <strong> Tilt your head</strong> left/right to change the pitch.
        <strong> Move your hand</strong> up/down to change the note.
      </p>

      <div style={{ display:"flex", justifyContent:"center" }}>
        <div style={{ position:"relative" }}>
          <Webcam ref={webcamRef} style={{ position:"absolute", width:640, height:480, transform:"scaleX(-1)", opacity:0.3 }} />
          <canvas ref={canvasRef} width={640} height={480} style={{ border:"2px solid #0ff" }} />
        </div>
        <canvas ref={visRef} width={200} height={480} style={{ border:"2px solid lime", marginLeft:20, background:"#000" }} />
      </div>
      <div style={{ marginTop:10 }}>
        <label>🎚 Pitch Slider:
          <input type="range" min="0.5" max="2" step="0.01" value={pitchSlider} onChange={e=>setPitchSlider(parseFloat(e.target.value))} />
        </label>
        <div style={{ marginTop:10 }}>Current Note: <strong>{activeNote}</strong></div>
      </div>
    </div>
  );
}
