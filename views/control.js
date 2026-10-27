const template = document.getElementById("control-template");
const container = document.getElementById("viewContainer");
const settingsBar = document.querySelector(".settings-bar");

const cellModal = document.getElementById('cellModal');
const cellModalBody = document.getElementById('cellModalBody');
const cellModalTitle = document.getElementById('cellModalTitle');
const cellModalClose = document.getElementById('cellModalClose');

let openCellSlot = null;

const validationTooltip = document.createElement('div');
validationTooltip.id = 'validationTooltip';
validationTooltip.classList.add('hidden');
document.body.appendChild(validationTooltip);

function showValidationTooltip(input) {
    const rect = input.getBoundingClientRect();
    validationTooltip.textContent = input.validationMessage;
    validationTooltip.style.left = `${rect.left}px`;
    validationTooltip.style.bottom = `${window.innerHeight - rect.top}px`;
    validationTooltip.classList.remove('hidden');
    input.classList.add('invalid');

    const hide = () => {
        validationTooltip.classList.add('hidden');
        input.classList.remove('invalid');
    };
    input.addEventListener('input', hide, {once: true});
    setTimeout(hide, 4000);
}

function positionCellModal() {
    const rect = container.getBoundingClientRect();
    cellModal.style.top = `${rect.top}px`;
    cellModal.style.left = `${rect.left}px`;
    cellModal.style.width = `${rect.width}px`;
    // Extend to the window bottom (covers the settings bar too) so the
    // centered .cap-box always has room, even when it's taller than the grid itself.
    cellModal.style.height = `${window.innerHeight - rect.top}px`;
}

function openCellPopup(slot, cell, index) {
    openCellSlot = slot;
    cellModalTitle.textContent = `View ${index + 1}`;
    cellModalBody.appendChild(cell);
    positionCellModal();
    cellModal.classList.remove('cap-hidden');
    container.classList.add('popup-open');
    settingsBar.classList.add('popup-open');
}

function closeCellPopup() {
    if (openCellSlot && cellModalBody.firstElementChild) {
        openCellSlot.appendChild(cellModalBody.firstElementChild);
    }
    openCellSlot = null;
    cellModal.classList.add('cap-hidden');
    container.classList.remove('popup-open');
    settingsBar.classList.remove('popup-open');
}

function resetCellPopup() {
    cellModalBody.innerHTML = '';
    openCellSlot = null;
    cellModal.classList.add('cap-hidden');
    container.classList.remove('popup-open');
    settingsBar.classList.remove('popup-open');
}

cellModalClose.onclick = () => closeCellPopup();

function updateCellsCollapsed() {
    // All cells share the same grid-cell size and content, so checking one is enough.
    const slot = container.querySelector('.cell-slot:has(.cell)');
    const cell = slot?.querySelector('.cell');
    if (!slot || !cell) return;

    const overflowing = cell.scrollWidth > slot.clientWidth || cell.scrollHeight > slot.clientHeight;
    container.classList.toggle('collapsed', overflowing);
}

function reportControlBottomAreaHeight() {
    // scrollHeight reflects the grid's true content height even if flex
    // layout/overflow has visually compressed its rendered box.
    const height = container.scrollHeight + settingsBar.scrollHeight;
    window.api?.setControlBottomAreaHeight(height);
}

const cellResizeObserver = new ResizeObserver(() => {
    updateCellsCollapsed();
    reportControlBottomAreaHeight();
    if (openCellSlot) positionCellModal();
});

// The icon font may still be loading at first measurement (rendering
// fallback text instead of compact glyphs), which can misreport overflow.
// Re-check once it's ready, since a font swap alone won't retrigger the observer.
document.fonts.ready.then(updateCellsCollapsed);

var displays;
var viewWindowPosition;
var draggedTabIndex = null;

let gridRows = 2;
let gridCols = 2;
let viewCount = gridRows * gridCols;

let inputs = [];
let forceVideoBtns = [];
let fullscreenBtns = [];
let priorityBtns = [];

const tickerInput = document.getElementById(`tickerText`);

function wireUrlInputDnD(input) {
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
}

function buildViewCells(rows, cols) {
    gridRows = rows;
    gridCols = cols;
    viewCount = rows * cols;

    resetCellPopup();
    cellResizeObserver.disconnect();

    container.innerHTML = '';
    container.style.setProperty('--grid-cols', cols);
    container.style.setProperty('--grid-rows', rows);

    for (let index = 0; index < viewCount; index++) {
        const clone = template.content.cloneNode(true);
        const cell = clone.querySelector(".cell");
        const preview = cell.querySelector(".preview-img");
        const pasteBtn = cell.querySelector(".pasteBtn");
        const copyBtn = cell.querySelector(".copyBtn");
        const backBtn = cell.querySelector(".backBtn");
        const forwardBtn = cell.querySelector(".forwardBtn");
        const input = cell.querySelector(".url");
        const navigateBtn = cell.querySelector(".navigateBtn");
        const forceVideoBtn = cell.querySelector(".forceVideoBtn");
        const fullscreenBtn = cell.querySelector(".fullscreenBtn");
        const priorityBtn = cell.querySelector(".priorityBtn");
        const screenShareBtn = cell.querySelector(".screenShareBtn");

        preview.id = `preview${index}`;

        input.placeholder = `View ${index + 1}`;
        input.id = `url${index}`;
        input.onkeydown = (e) => submitURL(e, index);
        wireUrlInputDnD(input);

        pasteBtn.onclick = () => {
            pasteControlUrl(index);
        }

        copyBtn.onclick = () => {
            copyControlUrl(index);
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

        const slot = document.createElement('div');
        slot.classList.add('cell-slot');

        const expandBtn = document.createElement('button');
        expandBtn.classList.add('expandBtn');
        expandBtn.title = `View ${index + 1}`;
        expandBtn.innerHTML = `
            <span class="material-symbols-outlined">open_in_full</span>
            <span class="expandUrl" id="expandUrl${index}"></span>
        `;
        expandBtn.onclick = () => openCellPopup(slot, cell, index);

        slot.appendChild(cell);
        slot.appendChild(expandBtn);
        container.appendChild(slot);
    }

    cellResizeObserver.observe(container);
    cellResizeObserver.observe(settingsBar);
    requestAnimationFrame(() => reportControlBottomAreaHeight());

    inputs = [];
    for (let i = 0; i < viewCount; i++) inputs[i] = document.getElementById(`url${i}`);
    inputs['control'] = document.getElementById('urlcontrol');

    forceVideoBtns = Array.from({length: viewCount}, (_, i) => document.getElementById(`forceVideoBtn${i}`));
    fullscreenBtns = Array.from({length: viewCount}, (_, i) => document.getElementById(`fullscreenBtn${i}`));
    priorityBtns = Array.from({length: viewCount}, (_, i) => document.getElementById(`priorityBtn${i}`));

    window.api?.requestStoredURLs().then((stored) => {
        stored.viewUrls?.forEach((url, i) => {
            if (inputs[i]) inputs[i].value = url;
            const expandUrlEl = document.getElementById(`expandUrl${i}`);
            if (expandUrlEl) expandUrlEl.textContent = url;
        });
    });

    const gridRowsInput = document.getElementById('gridRows');
    const gridColsInput = document.getElementById('gridCols');
    if (gridRowsInput) gridRowsInput.value = gridRows;
    if (gridColsInput) gridColsInput.value = gridCols;
}

window.api?.getGridSize().then(({rows, cols, min, max}) => {
    buildViewCells(rows, cols);

    const gridRowsInput = document.getElementById('gridRows');
    const gridColsInput = document.getElementById('gridCols');

    if (gridRowsInput) { gridRowsInput.min = min; gridRowsInput.max = max; }
    if (gridColsInput) { gridColsInput.min = min; gridColsInput.max = max; }
});
window.api?.onGridSizeChanged(({rows, cols}) => buildViewCells(rows, cols));

function applyGridSize() {
    const gridRowsInput = document.getElementById('gridRows');
    const gridColsInput = document.getElementById('gridCols');

    if (!gridRowsInput.checkValidity()) return showValidationTooltip(gridRowsInput);
    if (!gridColsInput.checkValidity()) return showValidationTooltip(gridColsInput);

    const rows = parseInt(gridRowsInput.value, 10);
    const cols = parseInt(gridColsInput.value, 10);
    if (Number.isFinite(rows) && Number.isFinite(cols)) {
        window.api?.setGridSize(rows, cols);
    }
}

window.api?.onURLUpdate(({index, url, canGoBack, canGoForward}) => {
    const input = document.getElementById(`url${index}`);
    if (input && document.activeElement !== input) {
        input.value = url;
    }

    const backBtn = document.getElementById(`backBtn${index}`);
    const forwardBtn = document.getElementById(`forwardBtn${index}`);

    if (backBtn) backBtn.disabled = !canGoBack;
    if (forwardBtn) forwardBtn.disabled = !canGoForward;

    const expandUrlEl = document.getElementById(`expandUrl${index}`);
    if (expandUrlEl) expandUrlEl.textContent = url;
});

const tabBar = document.getElementById('tabbar');

tabBar.addEventListener('dragover', (e) => {
    if (draggedTabIndex === null || e.target !== tabBar) return;
    e.preventDefault();
    tabBar.classList.add('drag-over-end');
});

tabBar.addEventListener('dragleave', (e) => {
    if (e.target === tabBar) tabBar.classList.remove('drag-over-end');
});

tabBar.addEventListener('drop', (e) => {
    if (draggedTabIndex === null || e.target !== tabBar) return;
    e.preventDefault();
    e.stopPropagation();
    tabBar.classList.remove('drag-over-end');

    const tabCount = tabBar.querySelectorAll(':scope > button:not(.newTab)').length;
    reorderTab(draggedTabIndex, tabCount - 1);
});

window.api?.onControlViewsUpdate(({titles, favicons, muted, index}) => {
    tabBar.innerHTML = '';

    titles.forEach((title, i) => {
        const tabBtn = document.createElement('button');
        if (i === index) {
            tabBtn.classList.add('active');
        }

        const muteBtn = document.createElement('span');
        muteBtn.classList.add('muteBtn');
        muteBtn.classList.add('material-symbols-outlined');
        muteBtn.innerText = muted[i] ? 'volume_off' : 'volume_up';
        muteBtn.addEventListener('click', (e) => {
            toggleMuteTab(i);
            e.stopPropagation();
        });
        tabBtn.appendChild(muteBtn);

        if (favicons[i]) {
            const icon = document.createElement('img');
            icon.src = favicons[i];
            icon.draggable = false;
            icon.addEventListener('error', () => tabBtn.removeChild(icon));
            tabBtn.appendChild(icon);
        }

        const label = document.createElement('span');
        label.innerText = title || 'Neuer Tab';
        tabBtn.appendChild(label);
        tabBtn.title = tabBtn.innerText;

        if (titles.length > 1) {
            const closeBtn = document.createElement('button');
            closeBtn.classList.add('closeBtn');
            closeBtn.classList.add('material-symbols-outlined');
            closeBtn.innerText = 'close';
            closeBtn.addEventListener('click', (e) => {
                closeTab(i);
                e.stopPropagation();
            });
            tabBtn.appendChild(closeBtn);
            tabBtn.addEventListener('auxclick', (e) => {
                if (e.button === 1) closeTab(i);
            });
        }

        tabBtn.addEventListener('click', () => setActiveTab(i));
        tabBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showTabContextMenu(i);
        });

        tabBtn.draggable = true;

        tabBtn.addEventListener('dragstart', (e) => {
            draggedTabIndex = i;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
            tabBtn.classList.add('dragging');
        });

        tabBtn.addEventListener('dragend', () => {
            draggedTabIndex = null;
            tabBtn.classList.remove('dragging');
        });

        tabBtn.addEventListener('dragover', (e) => {
            if (draggedTabIndex === null || draggedTabIndex === i) return;
            e.preventDefault();

            const rightHalf = isRightHalf(e, tabBtn);
            tabBtn.classList.toggle('drag-over-after', rightHalf);
            tabBtn.classList.toggle('drag-over-before', !rightHalf);
        });

        tabBtn.addEventListener('dragleave', () => {
            tabBtn.classList.remove('drag-over-after', 'drag-over-before');
        });

        tabBtn.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            tabBtn.classList.remove('drag-over-after', 'drag-over-before');

            if (draggedTabIndex !== null && draggedTabIndex !== i) {
                reorderTab(draggedTabIndex, getDropTargetIndex(draggedTabIndex, i, isRightHalf(e, tabBtn)));
            }
        });

        tabBar.appendChild(tabBtn);
    })

    const newTabBtn = document.createElement('button');
    newTabBtn.classList.add('newTab');
    newTabBtn.classList.add('material-symbols-outlined');
    newTabBtn.innerText = 'add';
    newTabBtn.addEventListener('click', () => openTab());

    tabBar.appendChild(newTabBtn);
});

window.api?.onDisplayWindowPositionUpdate((data) => {
    viewWindowPosition = data;
    this.updateActiveDisplay();
});

function navigate(index) {
    const input = inputs[index];
    window.api?.navigate(index, input?.value || '');
}

function setActiveTab(index) {
    window.api?.setActiveTab(index);
}

function reorderTab(from, to) {
    window.api?.reorderTab(from, to);
}

function isRightHalf(event, el) {
    const rect = el.getBoundingClientRect();
    return event.clientX - rect.left > rect.width / 2;
}

function getDropTargetIndex(from, targetIndex, rightHalf) {
    if (rightHalf) {
        return from < targetIndex ? targetIndex : targetIndex + 1;
    } else {
        return from < targetIndex ? targetIndex - 1 : targetIndex;
    }
}

function closeTab(index) {
    window.api?.closeTab(index);
}

function showTabContextMenu(index) {
    window.api?.showTabContextMenu(index);
}

function toggleMuteTab(index) {
    window.api?.toggleMuteTab(index);
}

function openTab() {
    const input = inputs['control'];
    window.api?.openTab();
    setTimeout(() => {
        input.value = '';
        input.focus();
    }, 100);
}

function pasteControlUrl(index) {
    const input = inputs['control'];
    window.api?.navigate(index, input?.value || '');
}

function copyControlUrl(index) {
    const input = inputs[index];
    window.api?.navigate('control', input?.value || '');
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
    if (index !== undefined) {
        const active = fullscreenBtns[index].classList.contains('active');
        document.querySelectorAll('button.fullscreenBtn.active').forEach((btn) => {
            btn.classList.remove('active');
        });

        if (!active) {
            fullscreenBtns[index].classList.add('active');
        }
    } else {
        document.querySelectorAll('button.fullscreenBtn.active').forEach((btn) => {
            btn.classList.remove('active');
        });
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

async function populateDisplayList() {
    const select = document.getElementById('displaySelect');
    displays = await window.api?.getDisplays();

    if (displays) {
        select.innerHTML = ''; // leeren
        displays?.forEach(display => {
            const {index, bounds, label} = display;
            const option = document.createElement('option');
            option.value = index;
            option.text = `Bildschirm ${index + 1}${label ? ': ' + label : ''} (${bounds.width}×${bounds.height})`;
            select.appendChild(option);
        });
    }

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
        const suffix = id.slice(3);
        const index = suffix === 'control' ? 'control' : +suffix;
        window.api?.navigate(index, path);
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
    for (let i = 0; i < viewCount; i++) {
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

window.api?.onDisplayWindowKeyDown((keyCode, shift, control) => {
    if (keyCode === 'Escape') {
        toggleFullscreen();
    } else if (keyCode === 'Tab') {
        let activeIndex = +(document.querySelector('button.fullscreenBtn.active')?.id.replace('fullscreenBtn', ''));

        let newIndex = shift ? viewCount - 1 : 0;
        if (!Number.isNaN(activeIndex)) {
            if (shift) {
                newIndex = activeIndex + viewCount - 1;
            } else {
                newIndex = activeIndex + 1;
            }
            newIndex = newIndex % viewCount;
        }

        toggleFullscreen(newIndex);
    } else if (keyCode.startsWith('Digit') || keyCode.startsWith('Numpad')) {
        const digit = +keyCode.substring(keyCode.length - 1);
        if (digit >= 1 && digit <= Math.min(9, viewCount)) {
            const index = digit - 1;

            if (shift) {
                togglePriority(index);
            } else if (control) {
                toggleForceVideo(index);
            } else {
                toggleFullscreen(index);
            }
        }
    }
});

const openSelectWrapper = document.createElement('div');
openSelectWrapper.id = 'openSelectWrapper';
document.body.appendChild(openSelectWrapper);

let openSelect;

function highlightOption(value) {
    openSelectWrapper.querySelectorAll('.selected').forEach((selected) => selected.classList.remove('selected'));
    openSelectWrapper.querySelectorAll(`[data-value="${value}"]`).forEach((el) => el.classList.add('selected'));
}

function selectOption(select, value) {
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    highlightOption(value);
}

function buildDisplayMap(select) {
    if (!displays?.length) return null;

    const minX = Math.min(...displays.map(d => d.bounds.x));
    const minY = Math.min(...displays.map(d => d.bounds.y));
    const maxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
    const maxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('display-map');
    svg.setAttribute('viewBox', `0 0 ${maxX - minX} ${maxY - minY}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    displays.forEach(d => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('display-map-rect');
        rect.dataset.value = d.index;
        rect.setAttribute('x', d.bounds.x - minX);
        rect.setAttribute('y', d.bounds.y - minY);
        rect.setAttribute('width', d.bounds.width);
        rect.setAttribute('height', d.bounds.height);

        if (String(d.index) === select.value) {
            rect.classList.add('selected');
        }

        rect.addEventListener('pointerdown', () => selectOption(select, String(d.index)));
        rect.addEventListener('mouseenter', () => highlightOption(String(d.index)));

        svg.appendChild(rect);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.classList.add('display-map-label');
        label.setAttribute('x', d.bounds.x - minX + d.bounds.width / 2);
        label.setAttribute('y', d.bounds.y - minY + d.bounds.height / 2);
        label.setAttribute('font-size', Math.min(d.bounds.width, d.bounds.height) * 0.3);
        label.textContent = d.index + 1;

        svg.appendChild(label);
    });

    return svg;
}

function toggleSelect(select) {
    openSelectWrapper.innerHTML = '';
    openSelectWrapper.classList.remove('with-map');

    if (select && openSelect !== select) {
        openSelect = select;

        const boundingRect = select.getBoundingClientRect();
        // The native BrowserView tab content always paints above regular DOM
        // content, so the dropdown must not grow past where it ends (viewContainer's top).
        const safeTop = container.getBoundingClientRect().top;

        openSelectWrapper.style.bottom = `${window.innerHeight - boundingRect.top}px`;
        openSelectWrapper.style.left = `${boundingRect.left}px`;
        openSelectWrapper.style.maxHeight = `${Math.max(0, boundingRect.top - safeTop - 8)}px`;

        const optionsList = document.createElement('div');
        optionsList.classList.add('options-list');
        optionsList.style.width = `${boundingRect.width}px`;

        select.querySelectorAll('option').forEach(opt => {
            const clonedOpt = document.createElement('div');
            clonedOpt.classList.add('option');
            clonedOpt.innerText = opt.innerText;
            clonedOpt.dataset.value = opt.value;

            clonedOpt.addEventListener('pointerdown', () => selectOption(select, opt.value));

            if (opt.value === select.value) {
                clonedOpt.classList.add('selected');
            }

            clonedOpt.addEventListener('mouseenter', () => highlightOption(opt.value));

            optionsList.appendChild(clonedOpt);
        });

        openSelectWrapper.appendChild(optionsList);

        if (select.id === 'displaySelect') {
            const displayMap = buildDisplayMap(select);
            if (displayMap) {
                openSelectWrapper.appendChild(displayMap);
                openSelectWrapper.classList.add('with-map');
            }
        }

        openSelectWrapper.style.width = openSelectWrapper.classList.contains('with-map')
            ? 'auto'
            : `${boundingRect.width}px`;

        const blurListener = () => {
            toggleSelect();
            select.focus();
            select.removeEventListener('blur', blurListener);
        }

        select.addEventListener('blur', blurListener);
    } else {
        openSelect = null;
    }
}

const selects = document.querySelectorAll('select');
selects.forEach(select => {
    select.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        select.focus();
    }, {capture: true, passive: false});

    select.addEventListener('keydown', (event) => {
        if ([' ', 'Enter'].includes(event.key)) {
            event.preventDefault();
            toggleSelect(select);
        } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            if (openSelect === select) {
                setTimeout(() => {
                    openSelectWrapper.querySelectorAll('.option').forEach(opt => {
                        if (opt.dataset.value === select.value) {
                            opt.classList.add('selected');
                        } else {
                            opt.classList.remove('selected');
                        }
                    })
                });
            }
        }
    });

    select.addEventListener('click', (event) => {
        toggleSelect(select);
    })
});

function onTestClick(event) {
    event.preventDefault();
    event.target.focus();
}