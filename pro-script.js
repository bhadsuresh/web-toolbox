// --- Global State and Overrides ---
const origFetch = window.fetch.bind(window);
const OrigXHR = window.XMLHttpRequest;
let enabled = false;
let autoTimer = null;
let delayHistory = []; 
const MAX_CHART_POINTS = 50;
let delayChart = null; 

// --- Chart Setup (Robust against module errors) ---
function initChart() {
    // Check included for safety, but we're ignoring the chart issue for now.
    if (typeof window.Chart === 'undefined') {
        return;
    }
    
    const canvas = document.getElementById('delayChart');
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');

    if (delayChart) {
        delayChart.destroy();
        delayChart = null;
    }
    
    // Proceed with Chart initialization
    delayChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: delayHistory.map((_, i) => i + 1),
            datasets: [{
                label: 'Actual Delay (ms)',
                data: delayHistory,
                borderColor: '#3498db',
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.1
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Delay (ms)' }
                },
                x: {
                    title: { display: true, text: 'Request Count' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function updateChart(delay) {
    delayHistory.push(delay);
    if (delayHistory.length > MAX_CHART_POINTS) {
        delayHistory.shift();
    }
    
    if (delayChart) {
        delayChart.data.datasets[0].data = delayHistory;
        delayChart.data.labels = delayHistory.map((_, i) => i + 1);
        delayChart.update();
    }
}

// --- Basic Logging ---
function log(msg, err = false) {
    const out = document.getElementById('log-output');
    if (!out) return;
    const t = new Date().toLocaleTimeString();
    out.innerHTML += `<div class="${err ? 'log-status-error' : ''}">[${t}] ${msg}</div>`;
    out.scrollTop = out.scrollHeight;
}

// --- Jitter and Distribution Logic ---
function getNormalRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function pickDelay() {
    const baseLatency = +document.getElementById('latency').value;
    const jitter = +document.getElementById('jitter').value;
    const distribution = document.getElementById('distribution').value;
    
    let offset = 0;
    switch (distribution) {
        case 'normal':
            offset = getNormalRandom() * jitter; 
            break;
        case 'burst':
            offset = (Math.random() < 0.9) 
                ? (Math.random() * jitter) * 0.2 
                : Math.random() * jitter;
            break;
        case 'uniform':
        default:
            offset = (Math.random() * 2 * jitter) - jitter;
            break;
    }
    
    return Math.max(0, Math.round(baseLatency + offset));
}

// --- Simulation Logic: Overrides native fetch ---
async function simFetch(url, opt) {
    if (!enabled) return origFetch(url, opt);
    
    const latency = pickDelay();
    const errorRate = +document.getElementById('error').value;
    const code = +document.getElementById('status').value;
    
    log(`Fetch ${url} delayed ${latency}ms (Error Rate: ${errorRate}%)`);
    
    const startTime = Date.now();
    await new Promise(r => setTimeout(r, latency));
    const actualDelay = Date.now() - startTime;
    updateChart(actualDelay);

    if (Math.random() * 100 < errorRate) {
        const statusText = document.getElementById('status').options[document.getElementById('status').selectedIndex].text;
        log(`Simulated Error Injection: ${code} ${statusText}`, true);
        
        return new Response(JSON.stringify({message: `Simulated ${code} ${statusText}`}),
            {status: code, statusText: statusText});
    } else {
        log(`Response: 200/Other OK (After ${latency}ms total delay)`);
        return origFetch(url, opt);
    }
}

// --- XHR Wrapper ---
function wrapXHR(){
  function Wrapped(){
    const xhr=new OrigXHR();
    const send=xhr.send; 
    xhr.send=function(...args){
      if(enabled){
        const d=pickDelay();
        log(`XHR delayed ${d}ms`);
        updateChart(d); 
        setTimeout(()=>send.apply(xhr,args),d);
      } else {
        send.apply(xhr,args);
      }
    }; 
    return xhr;
  }
  window.XMLHttpRequest=Wrapped;
}

// --- Core Function: Runs a single fetch test ---
async function runFetchOnce(){
    const url = document.getElementById('test-url').value.trim();
    log(`Starting test fetch to ${url}`);
    try{
        const r = await fetch(url);
        log(`Test completed. Final status: ${r.status} ${r.statusText}`);
        const txt = await r.text();
        log(`Response Snippet: ${txt.slice(0, 100) + (txt.length > 100 ? '...' : '')}`);
    }catch(err){
        log('Fetch error: ' + err.message, true);
    }
}

// --- Auto Loop ---
function toggleAutoLoop(checked) {
    if (autoTimer) clearInterval(autoTimer);
    
    if (checked) {
        const sec = +document.getElementById('auto-interval').value || 5;
        log(`Auto Fetch started every ${sec}s`);
        autoTimer = setInterval(runFetchOnce, sec * 1000);
    } else {
        log('Auto Fetch stopped');
    }
}

// --- Presets ---
const PROFILES = {
    '3g': { lat: 300, jit: 100, dist: 'normal', err: 2 },
    '4g': { lat: 80, jit: 30, dist: 'normal', err: 1 },
    'badwifi': { lat: 150, jit: 100, dist: 'burst', err: 5 },
    'satellite': { lat: 600, jit: 150, dist: 'normal', err: 3 }
};

function applyPreset() {
    const choice = prompt("Choose preset: 3G, 4G, BadWiFi, Satellite")?.toLowerCase();
    if (!choice || !PROFILES[choice]) {
        if (choice) log(`Error: Preset '${choice}' not found.`, true);
        return;
    }
    const p = PROFILES[choice];

    document.getElementById('latency').value = p.lat;
    document.getElementById('jitter').value = p.jit;
    document.getElementById('distribution').value = p.dist;
    document.getElementById('error').value = p.err;
    
    document.getElementById('latency').dispatchEvent(new Event('input'));
    document.getElementById('jitter').dispatchEvent(new Event('input'));
    document.getElementById('error').dispatchEvent(new Event('input'));
    document.getElementById('distribution').dispatchEvent(new Event('change'));
    
    log(`Applied preset: ${choice.toUpperCase()} (Lat: ${p.lat}ms, Jitter: ${p.jit}ms)`);
}

// --- Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Simulation Toggle (Core)
    document.getElementById('sim-toggle').addEventListener('change', e => {
      enabled = e.target.checked;
      if (enabled) {
        window.fetch = simFetch;
        wrapXHR();
        log('Pro Simulation enabled (Advanced Jitter/Errors)');
      } else {
        window.fetch = origFetch;
        window.XMLHttpRequest = OrigXHR;
        log('Simulation disabled');
      }
    });

    // 2. Input Updaters (CONFIRMED SLIDER FIX)
    const sliderMap = {
        'latency': 'latency-val',
        'jitter': 'jitter-val',
        'error': 'err-val' // The CRITICAL FIX for the Error Rate % slider
    };

    Object.keys(sliderMap).forEach(id => {
        const slider = document.getElementById(id);
        const targetSpan = document.getElementById(sliderMap[id]);

        if (targetSpan && slider) {
            // Set the initial value on load
            targetSpan.textContent = slider.value;
            slider.addEventListener('input', e => {
                // Update the value as the slider moves
                targetSpan.textContent = e.target.value;
            });
        }
    });
    
    document.getElementById('distribution').addEventListener('change', e => {
        const distValSpan = document.getElementById('dist-val');
        if (distValSpan) {
            distValSpan.textContent = e.target.value;
        }
    });

    // 3. Action Buttons
    document.getElementById('run-fetch').addEventListener('click', runFetchOnce);
    document.getElementById('clear-log').addEventListener('click', () => {
        document.getElementById('log-output').innerHTML='Log initialized.';
        delayHistory = [];
        if (delayChart) {
            delayChart.destroy();
            delayChart = null; 
        }
        const container = document.querySelector('.chart-container');
        if (container && container.style.display === 'block') { 
             setTimeout(initChart, 50);
        }
    });

    // 4. Pro/Advanced Features
    document.getElementById('presets').addEventListener('click', applyPreset);
    document.getElementById('auto-toggle').addEventListener('change', e => { toggleAutoLoop(e.target.checked); });
    document.getElementById('auto-interval').addEventListener('change', e => {
      if (document.getElementById('auto-toggle').checked) {
        toggleAutoLoop(false);
        toggleAutoLoop(true);
      }
    });
    
    // 5. Chart Toggle
    document.getElementById('toggle-chart').addEventListener('click', e => {
        const container = document.querySelector('.chart-container');
        
        if (!container) return; 

        if (container.style.display === 'block') { 
            container.style.display = 'none';
            e.target.textContent = '📈 Show Delay Chart';
            if (delayChart) {
                delayChart.destroy();
                delayChart = null;
            }
        } else { 
            container.style.display = 'block';
            e.target.textContent = '📉 Hide Delay Chart';
            
            setTimeout(() => {
                if (!delayChart) {
                    initChart();
                    log('Chart display initialized (Attempted).');
                }
            }, 50); 
        }
    });

    // 6. ACCORDION / COLLAPSIBLE SECTION LOGIC (RE-ACTIVATED FIX)
    const accordionHeaders = document.querySelectorAll('#intro-accordion .accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isActive = header.classList.contains('active');

            // Close all other open items
            document.querySelectorAll('#intro-accordion .accordion-header.active').forEach(otherHeader => {
                if (otherHeader !== header) {
                    otherHeader.classList.remove('active');
                    otherHeader.nextElementSibling.style.maxHeight = null;
                    otherHeader.nextElementSibling.style.padding = '0 15px'; 
                }
            });

            // Toggle the current item
            if (isActive) {
                header.classList.remove('active');
                content.style.maxHeight = null;
                content.style.padding = '0 15px'; 
            } else {
                header.classList.add('active');
                // Set maxHeight to scrollHeight to open fully
                content.style.maxHeight = content.scrollHeight + 'px'; 
                content.style.padding = '15px'; 
            }
        });
    });
    
    log('Pro System initialized. Ready to simulate network conditions.');
});