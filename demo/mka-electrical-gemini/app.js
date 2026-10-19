const MODEL = "models/gemini-3.8-live";
const VOICES = {
  female: { name: "Kate", geminiVoice: "Aoede" },
  male: { name: "Steve", geminiVoice: "Fenrir" },
};
const TZ = "Australia/Melbourne";
const $ = (id) => document.getElementById(id);
const screen = $("screen");
const els = {
  who: $("who"), timer: $("timer"), mode: $("mode"), captions: $("captions"),
  notice: $("notice"), call: $("call"), callLabel: $("call-label"), hang: $("hang"),
  mute: $("mute"), muteLabel: $("mute-label"), card: $("card"), cardRows: $("card-rows"),
  cardTitle: $("card-title"), wave: $("wave"), clock: $("clock"),
};
let voiceKey = "female", session = null, state = "idle", startedAt = 0, timerId = null;
let muted = false, attemptId = 0, lastUserLine = "", pendingBooking = null;
let ringCtx = null, ringInterval = null;
function playRingBurst() {
  if (!ringCtx || ringCtx.state !== "running") return;
  const start = ringCtx.currentTime;
  for (const frequency of [440, 480]) {
    const oscillator = ringCtx.createOscillator();
    const gain = ringCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.025);
    gain.gain.setValueAtTime(0.045, start + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    oscillator.connect(gain);
    gain.connect(ringCtx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.35);
  }
}
function startRinging() {
  stopRinging();
  try {
    ringCtx = new AudioContext();
    ringCtx.resume().then(() => {
      if (!ringCtx || state !== "connecting") return;
      playRingBurst();
      ringInterval = setInterval(() => {
        if (state === "connecting") playRingBurst();
      }, 2100);
    }).catch(() => {});
  } catch (error) { console.warn("[Demo ringtone]", error); }
}
function stopRinging() {
  if (ringInterval) clearInterval(ringInterval);
  ringInterval = null;
  const ctx = ringCtx;
  ringCtx = null;
  if (ctx) ctx.close().catch(() => {});
}
const heard = { agent: "", prevAgent: "", user: "" };
let agentTurnDone = true, agentCaptionElement = null;
function resetAgentCaptions() {
  heard.agent = "";
  heard.prevAgent = "";
  agentTurnDone = false;
  agentCaptionElement = null;
  els.captions.innerHTML = "";
}
try { const saved=localStorage.getItem("lumora-demo-voice");if(saved&&VOICES[saved])voiceKey=saved; } catch {}
const voiceButtons=[...document.querySelectorAll(".voice")];
function selectVoice(key){voiceKey=key;voiceButtons.forEach(b=>b.setAttribute("aria-checked",String(b.dataset.voice===key)));try{localStorage.setItem("lumora-demo-voice",key);}catch{}}
voiceButtons.forEach(b=>b.addEventListener("click",()=>state!=="live"&&state!=="connecting"&&selectVoice(b.dataset.voice)));selectVoice(voiceKey);

function melbourneParts(d=new Date()){const f=new Intl.DateTimeFormat("en-AU",{timeZone:TZ,weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true});const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,x.value]));const h24=Number(new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",hour12:false}).format(d));return{...p,h24};}
function context(){const now=new Date(),p=melbourneParts(now),weekend=p.weekday==="Saturday"||p.weekday==="Sunday",dates=[];for(let i=0;i<15;i++){const q=melbourneParts(new Date(now.getTime()+i*86400000));dates.push(`${q.weekday} ${q.day} ${q.month}${i===0?" (today)":i===1?" (tomorrow)":""}`);}return{now_melbourne:`${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`,office_status:weekend?"closed (weekend)":"open",upcoming_dates:dates.join("; ")};}
function tickClock(){els.clock.textContent=new Intl.DateTimeFormat("en-AU",{hour:"numeric",minute:"2-digit",hour12:false}).format(new Date());}tickClock();setInterval(tickClock,15000);
function setState(next){state=next;screen.dataset.state=next;const name=VOICES[voiceKey].name;els.call.hidden=next==="live"||next==="connecting";els.hang.hidden=next!=="live"&&next!=="connecting";els.mute.hidden=next!=="live";els.call.classList.toggle("busy",next==="connecting");els.call.disabled=next==="connecting";if(next==="idle"){els.who.textContent="AI receptionist · Melbourne";els.callLabel.textContent="Call";}if(next==="connecting")els.who.textContent="AI receptionist · Melbourne";if(next==="live")els.who.textContent=`${name} · AI receptionist`;if(next==="ended"){els.who.textContent="Call ended";els.callLabel.textContent="Call again";}}
function setMode(m){els.mode.textContent=m==="speaking"?`${VOICES[voiceKey].name} is speaking`:"Listening…";els.mode.classList.toggle("speaking",m==="speaking");}
const clean=t=>String(t||"").replace(/\[[^\]]*\]/g,"").replace(/\s{2,}/g," ").trim();
function showCaption(role,text){const t=clean(text);if(!t)return;if(role==="user"){lastUserLine=t;return;}if(!agentCaptionElement){if(lastUserLine){const you=document.createElement("p");you.className="you line";you.textContent=`“${lastUserLine}”`;els.captions.appendChild(you);lastUserLine="";}agentCaptionElement=document.createElement("p");agentCaptionElement.className="line";els.captions.appendChild(agentCaptionElement);}agentCaptionElement.textContent=t;}
const PLACEHOLDER=/^(|to be confirmed|tbc|tbd|unknown|n\/?a|none|pending)$/i;
function renderBooking(p,urgent=false){const rows=[["Name",p.customer_name],["Mobile",p.phone],["Address",p.address],["Suburb",p.suburb],["Job",p.job],["Preferred time",p.preferred_time]].filter(([,v])=>v&&!PLACEHOLDER.test(String(v).trim()));els.cardRows.innerHTML="";for(const[k,v]of rows){const dt=document.createElement("dt");dt.textContent=k;const dd=document.createElement("dd");dd.textContent=String(v);els.cardRows.append(dt,dd);}els.card.classList.toggle("urgent",urgent);els.cardTitle.textContent=urgent?"Demo priority enquiry":"Demo enquiry summary";els.card.classList.add("show");els.captions.style.opacity="0";}
function hideBooking(){els.card.classList.remove("show");els.captions.style.opacity="";}
function pcm16ToBase64(float32){const bytes=new Uint8Array(float32.length*2);const view=new DataView(bytes.buffer);for(let i=0;i<float32.length;i++){const s=Math.max(-1,Math.min(1,float32[i]));view.setInt16(i*2,s<0?s*0x8000:s*0x7fff,true);}let bin="";for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}
function base64ToBytes(s){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
let micStream=null,inputCtx=null,processor=null,source=null,silentGain=null,outputCtx=null,nextPlayAt=0;
function stopAudio(){try{processor?.disconnect();source?.disconnect();silentGain?.disconnect();}catch{}processor=null;source=null;silentGain=null;if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}try{inputCtx?.close();}catch{}inputCtx=null;try{outputCtx?.close();}catch{}outputCtx=null;nextPlayAt=0;}
function playPcm(data){if(!outputCtx||!data)return;const bytes=base64ToBytes(data);const samples=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));const buffer=outputCtx.createBuffer(1,samples.length,24000);const channel=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;const node=outputCtx.createBufferSource();node.buffer=buffer;node.connect(outputCtx.destination);nextPlayAt=Math.max(nextPlayAt,outputCtx.currentTime+0.02);node.start(nextPlayAt);nextPlayAt+=buffer.duration;setMode("speaking");node.onended=()=>{if(outputCtx&&outputCtx.currentTime>=nextPlayAt-0.05)setMode("listening");};}
async function getToken(voice){const r=await fetch("/api/demo/gemini-token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demo:"lumora-receptionist",voice})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||"Couldn't securely start the Gemini session.");if(!body.token)throw new Error("The server didn't return a session token.");return body.token;}
async function startCall(){if(state==="connecting"||state==="live")return;const id=++attemptId;els.notice.textContent="";els.captions.innerHTML="";lastUserLine="";heard.agent=heard.prevAgent=heard.user="";resetAgentCaptions();pendingBooking=null;hideBooking();setState("connecting");startRinging();let ws=null;
try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Microphone access is unavailable in this browser. Open the demo in a current browser over HTTPS.");
  micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const token=await getToken(voiceKey);if(id!==attemptId){stopAudio();return;}
  const { GoogleGenAI } = await import("https://esm.sh/@google/genai");
  inputCtx=new AudioContext({sampleRate:16000});outputCtx=new AudioContext({sampleRate:24000});await inputCtx.resume();await outputCtx.resume();source=inputCtx.createMediaStreamSource(micStream);processor=inputCtx.createScriptProcessor(4096,1,1);silentGain=inputCtx.createGain();silentGain.gain.value=0;source.connect(processor);processor.connect(silentGain);silentGain.connect(inputCtx.destination);
  const ai=new GoogleGenAI({apiKey:token,httpOptions:{apiVersion:"v1beta"}});const config={responseModalities:["AUDIO"],sessionResumption:{},systemInstruction:{parts:[{text:"You are a capable, friendly AI receptionist demonstrating how a trades business receptionist should handle service requests, using concise natural Australian English. This is a fictional Lumora Solutions demo, not a real trades business or booking service. Greet the caller first. If the caller asks for a service (for example, “can you come fix my toilet?”), respond positively and helpfully (for example, “Yes, we can help with that. I’ll just get a few details so the team knows what you need.”), without guaranteeing that a real technician is available or that a visit is confirmed. Ask one question at a time and collect: (1) caller’s name, (2) full service address including street number and street name, plus suburb, (3) best contact phone number, (4) what needs fixing and any useful details, (5) preferred day and time. Then ask whether there is anything else they would like the team to know. If information is missing, politely ask for it instead of guessing. Summarise the details back and ask the caller to confirm them before displaying the demo summary. Never claim a real booking, dispatch, or callback has been made; explicitly explain that details are only displayed in this demo and are not sent to a business. Do not invent availability or prices. Use Australia/Melbourne local date and time. Current Melbourne context: "+JSON.stringify(context())}]},speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:VOICES[voiceKey].geminiVoice}}},inputAudioTranscription:{},outputAudioTranscription:{},tools:[{functionDeclarations:[{name:"show_booking_summary",description:"Display a booking request summary only after collecting the details and reading them back for caller confirmation. Never claim that an appointment is confirmed.",parameters:{type:"OBJECT",properties:{customer_name:{type:"STRING"},phone:{type:"STRING"},address:{type:"STRING"},job:{type:"STRING"},suburb:{type:"STRING"},preferred_time:{type:"STRING"},urgent:{type:"BOOLEAN"}},required:["customer_name","phone","address","job","suburb","preferred_time"]}}]}]};
  session = await Promise.race([
    ai.live.connect({
    model: MODEL,
    config,
    callbacks: {
      onopen: () => {
        if (id !== attemptId) return;
        stopRinging();
        startedAt = Date.now();
        setState("live");
        setMode("listening");
        els.timer.textContent = "00:00";
        clearInterval(timerId);
        timerId = setInterval(() => {
          const seconds = Math.floor((Date.now() - startedAt) / 1000);
          els.timer.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
        }, 250);
      },
      onmessage: (message) => {
        if (id !== attemptId) return;
        const sc = message.serverContent || {};
        if (sc.inputTranscription?.text) {
          heard.user = clean(sc.inputTranscription.text);
          showCaption("user", heard.user);
        }
        if (sc.outputTranscription?.text) {
          if (agentTurnDone) resetAgentCaptions();
          heard.prevAgent = heard.agent;
          const incoming = clean(sc.outputTranscription.text);
          if (incoming) heard.agent = clean(heard.agent ? heard.agent + " " + incoming : incoming);
          agentTurnDone = false;
          showCaption("agent", heard.agent);
        }
        for (const part of sc.modelTurn?.parts || []) {
          if (part.inlineData?.mimeType?.startsWith("audio/pcm")) playPcm(part.inlineData.data);
        }
        if (message.toolCall?.functionCalls?.length) {
          const functionResponses = [];
          for (const call of message.toolCall.functionCalls) {
            let result = "This is a fictional demo. Read the details back for confirmation and explain that the summary is only shown on screen and is not sent anywhere.";
            if (call.name === "show_booking_summary") {
              const p = call.args || {};
              const urgent = p.urgent === true || p.urgent === "true";
              const missing = [p.customer_name, p.phone, p.address, p.job, p.suburb, p.preferred_time].some(v => PLACEHOLDER.test(String(v || "").trim()));
              if (missing) {
                result = "Missing required details. Collect the caller's name, phone and suburb first.";
              } else {
                renderBooking(p, urgent);
                result = "Demo summary displayed on screen only. Make clear that no real booking was made and no details were sent to anyone.";
              }
            }
            functionResponses.push({ id: call.id, name: call.name, response: { result } });
          }
          session?.sendToolResponse({ functionResponses });
        }
        if (sc.turnComplete) { agentTurnDone = true; setMode("listening"); }
      },
      onerror: (e) => {
        console.error("[Gemini Live]", e);
        if (id === attemptId) finishCall("Gemini connection failed. Check API access and your browser connection, then try again.");
      },
      onclose: () => {
        if (id === attemptId && (state === "live" || state === "connecting")) {
          finishCall("Gemini closed the connection. Check Live API access and try again.");
        }
      }
    }
    }),
    new Promise((_, reject) => { ws = setTimeout(() => reject(new Error("Gemini took longer than 20 seconds to connect. Check the browser connection and try again.")), 20000); })
  ]);
  clearTimeout(ws); ws = null;
  // Ask the model to start its first audio turn immediately after connection.
  try {
    session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: "Begin the call now. Greet the caller first with exactly this opening, spoken aloud in a natural Australian voice: Hi, you’ve reached the Lumora AI receptionist demo. I’m here to show how a virtual receptionist could help a business. How can I help you today? Do not wait for the caller to speak first. After the greeting, stop and listen." }] }],
      turnComplete: true
    });
    setMode("speaking");
    els.notice.textContent="";
  } catch (greetingError) {
    console.error("[Gemini greeting]", greetingError);
    throw new Error("Connected, but couldn't start the greeting. Please hang up and try again.");
  }
  processor.onaudioprocess=(event)=>{if(!session||muted||id!==attemptId)return;const input=event.inputBuffer.getChannelData(0);session.sendRealtimeInput({audio:{data:pcm16ToBase64(input),mimeType:"audio/pcm;rate=16000"}});};
}catch(e){clearTimeout(ws);ws=null;console.error("[Gemini demo]",e);if(id===attemptId){finishCall(e?.message?.includes("GEMINI_API_KEY")?"Gemini isn't configured yet. Add GEMINI_API_KEY in Vercel project settings.":e?.message||"Couldn't connect. Check the microphone and try again.");if(state==="ended")setState("idle");}}}
function finishCall(message=""){stopRinging();attemptId++;const s=session;session=null;try{s?.close();}catch{}stopAudio();clearInterval(timerId);startedAt=0;setState("ended");els.notice.textContent=message;muted=false;els.mute.setAttribute("aria-pressed","false");els.muteLabel.textContent="Mute";}
els.call.addEventListener("click",startCall);els.hang.addEventListener("click",()=>finishCall());els.mute.addEventListener("click",()=>{muted=!muted;els.mute.setAttribute("aria-pressed",String(muted));els.muteLabel.textContent=muted?"Unmute":"Mute";});
document.addEventListener("keydown",e=>{if(e.code!=="Space"||e.repeat)return;e.preventDefault();if(state==="live"||state==="connecting")finishCall();else startCall();});
window.addEventListener("pagehide",()=>{try{session?.close();}catch{}stopAudio();});setState("idle");
