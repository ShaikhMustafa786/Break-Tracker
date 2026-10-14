const $=id=>document.getElementById(id);
const state={manual:0,start:null,timer:null,refresh:null};

function duration(s){s=Math.max(0,Math.floor(s||0));return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}

function message(text,type="success"){const x=$("message");x.textContent=text;x.className=`message ${type}`}
function status(s){const x=$("statusBadge");x.className="badge "+(s==="WORKING"?"working":s==="ON BREAK"?"break":"idle");x.textContent=s==="WORKING"?"WORKING":s==="ON BREAK"?"ON BREAK":"READY";$("statusText").textContent=s==="WORKING"?"Currently working":s==="ON BREAK"?"Last swipe was OUT":"Waiting"}

function required(){return Math.round((parseFloat($("requiredHours").value)||8)*3600)}

function render(c){
  $("officeIn").textContent=c.office_in;$("worked").textContent=c.worked;$("totalBreak").textContent=c.total_break;$("expectedOut").textContent=c.expected_out;$("requiredText").textContent=`Required: ${c.required_work}`;
  $("recordSummary").textContent=`${c.record_count} RECORDS · ${c.duplicate_count} DUPLICATE IGNORED`;status(c.status);
  const t=$("timeline");
  t.className="timeline";
  t.innerHTML=c.records.map(r=>`<div class="record ${r.event.toLowerCase()}${r.duplicate?" duplicate":""}">
    <div class="record-time">${r.display}</div><div class="event ${r.event.toLowerCase()}">${r.event}</div>
    <div class="record-location">${esc(r.location||"Attendance swipe")}</div>
    <div class="record-note">${esc(r.duplicate_reason||(r.source==="timestamp"?"Event inferred from sequence":""))}</div>
  </div>`).join("");
  message(c.duplicate_count?`Attendance calculated automatically. ${c.duplicate_count} duplicate consecutive record(s) were ignored for calculation.`:"Attendance calculated successfully.",c.duplicate_count?"warning":"success");
}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}

async function calculate(){
  const text=$("attendanceText").value.trim();if(!text)return;
  try{
    const r=await fetch("/api/calculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,required_work_seconds:required(),manual_break_seconds:state.manual})});
    const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||"Calculation failed");render(d);
  }catch(e){message(e.message,"error")}
}

async function upload(file){
  if(!file)return;
  $("preview").src=URL.createObjectURL(file);$("previewWrap").classList.remove("hidden");$("progress").classList.remove("hidden");
  const fd=new FormData();fd.append("image",file);
  try{
    const r=await fetch("/api/ocr",{method:"POST",body:fd});const d=await r.json();
    if(!r.ok||!d.success)throw Error(d.message||"OCR failed");
    $("ocrText").value=d.ocr_text||"";$("attendanceText").value=d.ocr_text||"";
    render(d.calculation);
  }catch(e){message(e.message,"error")}finally{$("progress").classList.add("hidden")}
}

function updateTimer(){if(state.start)$("manualTimer").textContent=duration((Date.now()-state.start)/1000)}
function startBreak(){
  if(state.start)return;state.start=Date.now();$("startBreak").disabled=true;$("stopBreak").disabled=false;$("manualState").textContent="ON BREAK";state.timer=setInterval(updateTimer,1000);updateTimer();status("ON BREAK")
}
async function stopBreak(){
  if(!state.start)return;state.manual+=Math.floor((Date.now()-state.start)/1000);state.start=null;clearInterval(state.timer);state.timer=null;$("manualTimer").textContent="00:00:00";$("manualTotal").textContent=duration(state.manual);$("startBreak").disabled=false;$("stopBreak").disabled=true;$("manualState").textContent="NOT RUNNING";await calculate()
}

$("imageInput").onchange=e=>upload(e.target.files[0]);
$("calculateBtn").onclick=calculate;
$("attendanceText").oninput=()=>{clearTimeout(state.refresh);state.refresh=setTimeout(calculate,400)};
$("requiredHours").oninput=()=>{clearTimeout(state.refresh);state.refresh=setTimeout(calculate,300)};
$("startBreak").onclick=startBreak;$("stopBreak").onclick=stopBreak;
$("exampleBtn").onclick=()=>{$("attendanceText").value="17:58:in(Pune),18:44:out(Pune),19:12:in(Pune),22:00:out(Pune),22:22:in(Pune),22:30:out(Pune),23:23:out(Pune),23:54:in(Pune)";calculate()};
$("clearBtn").onclick=()=>{if(state.start)return;$("attendanceText").value="";$("ocrText").value="";$("imageInput").value="";$("previewWrap").classList.add("hidden");$("timeline").className="timeline empty";$("timeline").textContent="Upload or paste records to see the timeline.";status("READY");$("officeIn").textContent="--:--:--";$("worked").textContent="00:00:00";$("totalBreak").textContent="00:00:00";$("expectedOut").textContent="--:--:--";$("recordSummary").textContent="0 RECORDS";$("message").className="message hidden"};

setInterval(()=>{if($("attendanceText").value.trim())calculate()},10000);
status("READY");


/* ==========================================
   RAIN ON GLASS - BACKGROUND EFFECT
   Safe addition to existing attendance code
========================================== */

(() => {
    if (document.getElementById("rainCanvas")) return;

    const canvas = document.createElement("canvas");
    canvas.id = "rainCanvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    );

    let width = 0;
    let height = 0;
    let drops = [];
    let animationId = null;

    const random = (min, max) => Math.random() * (max - min) + min;

    function createDrop(initial = false) {
        return {
            x: random(0, width),
            y: initial ? random(0, height) : random(-100, -10),
            length: random(10, 25),
            speed: random(1, 3),
            drift: random(-0.15, 0.15),
            opacity: random(0.55, 0.95),
            thickness: random(0.5, 1.1)
        };
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        width = window.innerWidth;
        height = window.innerHeight;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = Math.min(
            150,
            Math.max(45, Math.floor(width / 8))
        );

        drops = Array.from(
            { length: count },
            () => createDrop(true)
        );

        drawLights();
    }

    function drawLights() {
        ctx.clearRect(0, 0, width, height);

        const lights = [
            [width * 0.12, height * 0.20, 120, "100,170,255"],
            [width * 0.82, height * 0.25, 145, "170,145,255"],
            [width * 0.85, height * 0.80, 115, "90,190,240"],
            [width * 0.22, height * 0.82, 100, "125,140,255"]
        ];

        for (const [x, y, radius, color] of lights) {
            const gradient = ctx.createRadialGradient(
                x, y, 0, x, y, radius
            );

            gradient.addColorStop(0, `rgba(${color},0.10)`);
            gradient.addColorStop(1, `rgba(${color},0)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(
                x - radius,
                y - radius,
                radius * 2,
                radius * 2
            );
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        drawLights();

        for (const drop of drops) {
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(
                drop.x + drop.drift * 4,
                drop.y + drop.length
            );

            ctx.strokeStyle =
                `rgba(215,232,255,${drop.opacity})`;

            ctx.lineWidth = drop.thickness;
            ctx.lineCap = "round";
            ctx.stroke();

            drop.y += drop.speed * 3;
            drop.x += drop.drift;

            if (drop.y > height + drop.length) {
                Object.assign(drop, createDrop());
            }

            if (drop.x < -5) drop.x = width + 5;
            if (drop.x > width + 5) drop.x = -5;
        }

        animationId = requestAnimationFrame(animate);
    }

    function stop() {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function start() {
        stop();

        if (reducedMotion.matches || document.hidden) {
            drawLights();
            return;
        }

        animate();
    }

    window.addEventListener("resize", resize, { passive: true });

    document.addEventListener("visibilitychange", start);

    if (reducedMotion.addEventListener) {
        reducedMotion.addEventListener("change", start);
    }

    resize();
    start();
})();


let canvas = document.getElementById("rainCanvas");

if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "rainCanvas";
    document.body.prepend(canvas);
}