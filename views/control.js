const viewControlsConfigs = [
    {index: 0, label: "View 1 (oben links)", icon: "position_top_right", flip: true},
    {index: 1, label: "View 2 (oben rechts)", icon: "position_top_right"},
    {index: 2, label: "View 3 (unten links)", icon: "position_bottom_left"},
    {index: 3, label: "View 4 (unten rechts)", icon: "position_bottom_right"}
];

const template = document.getElementById("control-template");
const container = document.getElementById("viewContainer");
const marker = document.getElementById("view-insertion-point");

var displays;
var viewWindowPosition;

viewControlsConfigs.forEach(({index, label, icon, flip}) => {
    const clone = template.content.cloneNode(true);
    const cell = clone.querySelector(".cell");
    const iconSpan = cell.querySelector(".icon");
    const preview = cell.querySelector(".preview-img");
    const pasteBtn = cell.querySelector(".pasteBtn");
    const backBtn = cell.querySelector(".backBtn");
    const forwardBtn = cell.querySelector(".forwardBtn");
    const input = cell.querySelector(".url");
    const navigateBtn = cell.querySelector(".navigateBtn");
    const forceVideoBtn = cell.querySelector(".forceVideoBtn");
    const fullscreenBtn = cell.querySelector(".fullscreenBtn");
    const priorityBtn = cell.querySelector(".priorityBtn");
    const screenShareBtn = cell.querySelector(".screenShareBtn");

    // Set dynamic content
    iconSpan.textContent = icon;
    if (flip) iconSpan.classList.add("flip-horizontal");

    preview.id = `preview${index}`;

    input.placeholder = label;
    input.id = `url${index}`;
    input.onkeydown = (e) => submitURL(e, index);

    pasteBtn.onclick = () => {
        pasteControlUrl(index);
    }

    backBtn.id = `backBtn${index}`;
    backBtn.onclick = () => {
        goBack(index);
    }

    forwardBtn.id = `forwardBtn${index}`;
    forwardBtn.onclick = () => {
        goForward(index);
    }

    navigateBtn.onclick = () => {
        navigate(index);
    }

    forceVideoBtn.id = `forceVideoBtn${index}`;
    forceVideoBtn.onclick = () => toggleForceVideo(index);

    fullscreenBtn.id = `fullscreenBtn${index}`;
    fullscreenBtn.onclick = () => toggleFullscreen(index);

    priorityBtn.id = `priorityBtn${index}`;
    priorityBtn.onclick = () => togglePriority(index);

    screenShareBtn.id = `screenShareBtn${index}`;
    screenShareBtn.onclick = async () => {
        openCapturePicker(index, async (picked) => {
            await window.api.setDisplayCaptureSource(index, picked.id);
            await window.api.startDisplayCapture(index);
        });
    };

    container.insertBefore(clone, marker);
});

const inputs = [];
[0, 1, 2, 3, 'control'].forEach(i => inputs[i] = document.getElementById(`url${i}`));
const forceVideoBtns = [0, 1, 2, 3].map(i => document.getElementById(`forceVideoBtn${i}`));
const fullscreenBtns = [0, 1, 2, 3].map(i => document.getElementById(`fullscreenBtn${i}`));
const priorityBtns = [0, 1, 2, 3].map(i => document.getElementById(`priorityBtn${i}`));
const tickerInput = document.getElementById(`tickerText`);

inputs.forEach(input => {
    let dragCounter = 0;

    input.addEventListener('dragenter', () => {
        dragCounter++;
        input.classList.add('drag-target');
    });

    input.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter === 0) {
            input.classList.remove('drag-target');
        }
    });

    input.addEventListener('drop', () => {
        dragCounter = 0;
        input.classList.remove('drag-target');
    });
});

window.api?.requestStoredURLs().then((stored) => {
    stored.viewUrls?.forEach((url, i) => {
        if (inputs[i]) inputs[i].value = url;
    });
});

window.api?.onURLUpdate(({index, url, canGoBack, canGoForward}) => {
    const input = document.getElementById(`url${index}`);
    if (input) {
        input.value = url;
        saveAllURLs();
    }

    const backBtn = document.getElementById(`backBtn${index}`);
    const forwardBtn = document.getElementById(`forwardBtn${index}`);

    if (backBtn) backBtn.disabled = !canGoBack;
    if (forwardBtn) forwardBtn.disabled = !canGoForward;
});

window.api?.onDisplayWindowPositionUpdate((data) => {
    viewWindowPosition = data;
    this.updateActiveDisplay();
});

function navigate(index) {
    const input = inputs[index];
    window.api?.navigate(index, input?.value || '');
    saveAllURLs();
}

function pasteControlUrl(index) {
    const input = inputs['control'];
    window.api?.navigate(index, input?.value || '');
    saveAllURLs();
}

function submitURL(event, index) {
    if (event.key === 'Enter') {
        navigate(index);
    }
}

function toggleForceVideo(index) {
    const active = forceVideoBtns[index].classList.contains('active');
    const btn = forceVideoBtns[index];

    if (!active) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }

    window.api?.toggleForceVideo(index);
}

function toggleFullscreen(index) {
    const active = fullscreenBtns[index].classList.contains('active');
    document.querySelectorAll('button.fullscreenBtn.active').forEach((btn) => {
        btn.classList.remove('active');
    });

    if (!active) {
        fullscreenBtns[index].classList.add('active');
    }

    window.api?.toggleFullscreen(index);
}

function togglePriority(index) {
    const active = priorityBtns[index].classList.contains('active');
    document.querySelectorAll('button.priorityBtn.active').forEach((btn) => {
        btn.classList.remove('active');
    });

    if (!active) {
        priorityBtns[index].classList.add('active');
    }

    window.api?.togglePriority(index);
}

function goBack(index) {
    window.api?.goBack(index);
}

function goForward(index) {
    window.api?.goForward(index);
}

function saveAllURLs() {
    const viewUrls = inputs.map(input => input.value || '');
    const controlUrl = inputs['control'].value;
    window.api?.saveURLs(viewUrls, controlUrl);
}

async function populateDisplayList() {
    const select = document.getElementById('displaySelect');
    displays = await window.api?.getDisplays();

    select.innerHTML = ''; // leeren
    displays?.forEach(display => {
        const {index, bounds, label} = display;
        const option = document.createElement('option');
        option.value = index;
        option.text = `Bildschirm ${index + 1}${label ? ': ' + label : ''} (${bounds.width}×${bounds.height})`;
        select.appendChild(option);
    });

    updateActiveDisplay();
}

function changeDisplay() {
    const select = document.getElementById('displaySelect');
    const index = parseInt(select.value, 10);
    if (!isNaN(index)) {
        window.api?.moveToDisplay(index);
    }
}

populateDisplayList();

function setTicker() {
    window.api?.setTickerText(tickerInput?.value || '');
}

function submitTicker(event) {
    if (event.key === 'Enter') {
        setTicker();
    }
}

function setTickerColor(event) {
    window.api?.setTickerColor(event.target.value);
}

function setTickerBackgroundColor(event) {
    window.api?.setTickerBackgroundColor(event.target.value);
}

window.api?.onDrop(({path, id}) => {
    if (id.startsWith('url')) {
        document.getElementById(id).value = path;
        const index = +id[3];
        window.api?.navigate(index, path);
        saveAllURLs();
    }
});

window.api?.loadTicker().then(({tickerText, tickerColor, tickerBackgroundColor}) => {
    if (tickerText) {
        tickerInput.value = tickerText;
        window.api?.setTickerText(tickerText);
    }

    if (tickerColor) {
        document.getElementById("tickerColor").value = tickerColor;
        window.api?.setTickerColor(tickerColor);
    }

    if (tickerBackgroundColor) {
        document.getElementById("tickerBackgroundColor").value = tickerBackgroundColor;
        window.api?.setTickerBackgroundColor(tickerBackgroundColor);
    }
});

function updatePreview(index) {
    window.api?.getScreenshot(index).then((dataUrl) => {
        if (dataUrl) {
            const img = document.getElementById(`preview${index}`);
            if (img) img.src = dataUrl;
        }
    });
}

setInterval(() => {
    for (let i = 0; i < 4; i++) {
        updatePreview(i);
    }
    updatePreview('control');
}, 4000);

const capModal = document.getElementById('capModal');
const capGrid = document.getElementById('capGrid');
const capClose = document.getElementById('capClose');

function showCapModal(show) {
    capModal.classList.toggle('cap-hidden', !show);
    if (show) capModal.focus();
}

async function openCapturePicker(viewIndex, onPicked) {
    showCapModal(true);
    capGrid.innerHTML = '<div style="opacity:.7">Lade Quellen …</div>';
    try {
        const sources = await window.api.getCaptureSources();
        if (!sources?.length) {
            capGrid.innerHTML = '<div style="opacity:.7">Keine Quellen gefunden.</div>';
            return;
        }
        capGrid.innerHTML = '';
        for (const s of sources) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cap-item';
            card.innerHTML = `
    <img class="cap-thumb" alt="" src="${s.thumbDataUrl || ''}">
    <div class="cap-name">${s.name || s.id}</div>
  `;
            if (s.id.startsWith('screen')) {
                const iconEl = document.createElement('span');
                iconEl.classList.add('material-symbols-outlined');
                iconEl.innerHTML = 'monitor';
                card.appendChild(iconEl);
            }

            card.onclick = async () => {
                showCapModal(false);
                onPicked?.(s);
            };
            capGrid.appendChild(card);
        }
    } catch (e) {
        capGrid.innerHTML = `<div style="color:#ff8">${e.message || e}</div>`;
    }
}

capClose.onclick = () => {
    showCapModal(false);
    window.api.cancelCaptureSourcesSelect();
}

window.api?.onNotifyNewVersion((release) => {
    console.log(release);

    const message = document.querySelector('.message');
    if (message) {
        const text = message.querySelector('.text');
        text.innerHTML = `Eine <a href="${release.html_url}" target="_blank">neue Version (${release.tag_name})</a> ist verfügbar!`;
        message.classList.remove('hidden');
    }
});

function closeMessage() {
    document.querySelector('.message')?.classList.add('hidden');
}

function updateActiveDisplay() {
    if (viewWindowPosition && displays) {
        let bestIndex = 0;
        let bestDist = getDistance(viewWindowPosition, displays[bestIndex].bounds);

        for (let i = 1; i < displays.length; i++) {
            const dist = getDistance(viewWindowPosition, displays[i].bounds);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        const select = document.getElementById('displaySelect');
        select.value = bestIndex;
    }
}

function getDistance(a, b) {
    return (
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        Math.abs(a.width - b.width) +
        Math.abs(a.height - b.height)
    );
}