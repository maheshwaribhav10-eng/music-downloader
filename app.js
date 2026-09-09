/* ELEMENTS */
const songInput = document.getElementById("songInput");
const addButton = document.getElementById("addButton");
const importButton = document.getElementById("importButton");
const fileInput = document.getElementById("fileInput");
const clearButton = document.getElementById("clearButton");
const downloadButton = document.getElementById("downloadButton");
const songList = document.getElementById("songList");
const emptyState = document.getElementById("emptyState");
const queueCount = document.getElementById("queueCount");
const downloadCount = document.getElementById("downloadCount");
const liveProgressContainer = document.getElementById("liveProgressContainer");
const downloadsPageList = document.getElementById("downloadsPageList");
const clearDownloads = document.getElementById("clearDownloads");
const retryAllButton = document.getElementById("retryAllButton");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const saveSettings = document.getElementById("saveSettings");

const searchModal = document.getElementById("searchModal");
const modalResultsList = document.getElementById("modalResultsList");
const modalSongTitle = document.getElementById("modalSongTitle");
const closeModalBtn = document.getElementById("closeModalBtn");

/* DATA */
let songs = [];
let pollInterval = null;
let activeSelectingSongIndex = null;

/* INIT */
document.addEventListener("DOMContentLoaded", () => {
    loadSavedData();
    renderSongs();
    setupNavigation();
    startStatusPolling();
});

/* QUEUE LOGIC */
function addSong(songText) {
    const text = songText.trim();
    if (!text) { showToast("Enter a song name first."); return; }
    if (songs.some(s => s.toLowerCase() === text.toLowerCase())) {
        showToast("That song is already in the queue.");
        return;
    }
    songs.push(text);
    saveData();
    renderSongs();
    songInput.value = "";
    songInput.focus();
    showToast("Song added to queue.");
}

function removeSong(index) {
    songs.splice(index, 1);
    saveData();
    renderSongs();
}

function clearQueue() {
    if (songs.length === 0) return;
    songs = [];
    saveData();
    renderSongs();
    showToast("Queue cleared.");
}

addButton.addEventListener("click", () => addSong(songInput.value));
songInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addSong(songInput.value); } });
clearButton.addEventListener("click", clearQueue);

function renderSongs() {
    queueCount.textContent = songs.length;
    if (songs.length === 0) {
        songList.innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="empty-icon">♫</div>
                <h4>Your queue is empty</h4>
                <p>Add a song above or import your <strong>songs.txt</strong> file.</p>
            </div>`;
        return;
    }

    songList.innerHTML = "";
    songs.forEach((song, index) => {
        const parsed = parseSong(song);
        const row = document.createElement("div");
        row.className = "song-row";
        row.innerHTML = `
            <div class="song-art">♫</div>
            <div class="song-info">
                <div class="song-title">${escapeHTML(parsed.title)}</div>
                <div class="song-artist">${escapeHTML(parsed.artist)}</div>
            </div>
            <div style="display: flex; gap: 6px;">
                <button class="search-song-btn" data-index="${index}" style="background: transparent; border: 1px solid #555; color: #ccc; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">🔍 Pick Version</button>
                <button class="remove-song" data-index="${index}">×</button>
            </div>
        `;
        songList.appendChild(row);
    });

    document.querySelectorAll(".remove-song").forEach(btn => btn.addEventListener("click", () => removeSong(Number(btn.dataset.index))));
    document.querySelectorAll(".search-song-btn").forEach(btn => btn.addEventListener("click", () => openSearchModal(Number(btn.dataset.index))));
}

function parseSong(song) {
    if (song.startsWith("http://") || song.startsWith("https://")) return { title: "YouTube URL Locked", artist: song };
    const parts = song.split(" - ");
    if (parts.length >= 2) return { title: parts.slice(0, -1).join(" - ").trim(), artist: parts[parts.length - 1].trim() };
    return { title: song, artist: "Unknown artist" };
}

/* TXT IMPORT */
importButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
        const text = await readTextFile(file);
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("#"));
        let added = 0;
        lines.forEach(line => {
            if (!songs.some(s => s.toLowerCase() === line.toLowerCase())) {
                songs.push(line);
                added++;
            }
        });
        saveData();
        renderSongs();
        showToast(`Successfully imported ${added} songs.`);
    } catch (error) {
        showToast("Could not read TXT file properly.");
    }
    fileInput.value = "";
});

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try { resolve(new TextDecoder("utf-8", { fatal: true }).decode(e.target.result)); } 
            catch { resolve(new TextDecoder("windows-1252").decode(e.target.result)); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/* YOUTUBE SEARCH MODAL */
closeModalBtn.addEventListener("click", () => searchModal.classList.remove("show"));
window.addEventListener("click", e => { if (e.target === searchModal) searchModal.classList.remove("show"); });

async function openSearchModal(index) {
    activeSelectingSongIndex = index;
    const songName = songs[index];
    modalSongTitle.textContent = `Choices for: "${songName}"`;
    modalResultsList.innerHTML = '<p style="text-align: center; color: #888;">Fetching top matches...</p>';
    searchModal.classList.add("show");

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(songName)}`);
        const data = await response.json();
        if (!data.success || !data.results.length) {
            modalResultsList.innerHTML = '<p style="text-align: center; color: #ff6b6b;">No results found.</p>';
            return;
        }
        modalResultsList.innerHTML = "";
        data.results.forEach(item => {
            const minutes = Math.floor(item.duration / 60);
            const seconds = item.duration % 60;
            const duration = item.duration ? `${minutes}:${seconds < 10 ? '0' : ''}${seconds}` : "Live";
            
            const card = document.createElement("div");
            card.style.cssText = "background: #2a2a2a; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; gap: 10px;";
            card.innerHTML = `
                <div style="overflow: hidden;">
                    <div style="font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">${escapeHTML(item.title)}</div>
                    <div style="font-size: 12px; color: #aaa; margin-top: 3px;">${escapeHTML(item.channel)} &bull; ${duration}</div>
                </div>
                <button class="select-version-btn" data-url="${item.url}" style="padding: 6px 12px; background: #1db954; color: #fff; border: none; border-radius: 4px; font-weight: 600;">Select</button>
            `;
            card.querySelector(".select-version-btn").addEventListener("click", () => {
                songs[activeSelectingSongIndex] = item.url; 
                saveData();
                renderSongs();
                showToast(`Locked specific version!`);
                searchModal.classList.remove("show");
            });
            modalResultsList.appendChild(card);
        });
    } catch (error) {
        modalResultsList.innerHTML = '<p style="text-align: center; color: #ff6b6b;">Failed to fetch search choices.</p>';
    }
}

/* API DOWNLOADS */
downloadButton.addEventListener("click", async () => {
    if (songs.length === 0) { showToast("Add songs to the queue first."); return; }
    try {
        const response = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ songs: songs })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error);
        showToast(result.message);
    } catch (error) {
        showToast("Error: " + error.message);
    }
});

/* POLLING & UI UPDATES */
function startStatusPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const response = await fetch("/api/status");
            if (!response.ok) return;
            const state = await response.json();
            updateLiveProgress(state);
            updateHistoryUI(state.history || []);
            
            // Remove completed/failed songs from active queue
            if (state.completed.length || state.failed.length) {
                const initialLength = songs.length;
                songs = songs.filter(s => !state.completed.includes(s) && !state.failed.some(f => f.song === s));
                if (songs.length !== initialLength) { saveData(); renderSongs(); }
            }
        } catch (error) {}
    }, 1000);
}

function updateLiveProgress(state) {
    if (!state.running || !state.current) {
        liveProgressContainer.innerHTML = `<div style="color: #9299a3; font-size: 13px;">No active downloads. Queue is clear.</div>`;
        return;
    }
    
    let stats = state.status;
    if (state.speed) stats += ` | ${state.speed}`;
    if (state.eta) stats += ` | ETA: ${state.eta}`;
    
    liveProgressContainer.innerHTML = `
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 5px;">${escapeHTML(state.current)}</div>
        <div style="font-size: 11px; color: #a8e063; margin-bottom: 10px;">Song ${state.current_index} of ${state.total} &mdash; ${escapeHTML(stats)}</div>
        <div class="progress-track" style="background: #24282e; height: 6px; border-radius: 6px; overflow: hidden;">
            <div class="progress-fill" style="width: ${state.progress}%; background: #a8e063; height: 100%; transition: width 0.3s;"></div>
        </div>
    `;
}

function updateHistoryUI(history) {
    downloadCount.textContent = history.length;
    if (!history.length) {
        downloadsPageList.innerHTML = `<div class="download-empty"><div class="download-empty-icon">↓</div><div><strong>No history yet</strong><span>Completed and failed downloads will appear here.</span></div></div>`;
        return;
    }
    
    downloadsPageList.innerHTML = "";
    history.forEach(item => {
        const el = document.createElement("div");
        el.className = "download-item";
        
        let retryBtn = item.failed ? `<button class="retry-btn text-button" data-song="${escapeHTML(item.name)}" style="margin-top: 5px; color: #e87878; text-decoration: underline;">Retry Download</button>` : "";
        let color = item.failed ? "#e87878" : (item.status === "Duplicate" ? "#9299a3" : "#a8e063");
        
        el.innerHTML = `
            <div class="download-top">
                <div class="download-status-icon" style="color: #111; background: ${color};">✓</div>
                <div class="download-info">
                    <div class="download-name">${escapeHTML(item.name)}</div>
                    <div class="download-state">${escapeHTML(item.status)}</div>
                    ${retryBtn}
                </div>
            </div>
        `;
        downloadsPageList.appendChild(el);
    });

    document.querySelectorAll(".retry-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const songName = btn.dataset.song;
            songs.push(songName);
            saveData(); renderSongs(); showToast(`Re-added ${songName}`);
            await fetch("/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs: [songName] }) });
        });
    });
}

retryAllButton.addEventListener("click", async () => {
    try {
        const res = await fetch("/api/status");
        const state = await res.json();
        const failedSongs = state.history.filter(h => h.failed).map(h => h.name);
        if(!failedSongs.length) { showToast("No failed downloads to retry."); return; }
        
        failedSongs.forEach(s => { if(!songs.includes(s)) songs.push(s); });
        saveData(); renderSongs();
        await fetch("/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs: failedSongs }) });
        showToast(`Retrying ${failedSongs.length} failed songs!`);
    } catch (e) { showToast("Error retrying."); }
});

clearDownloads.addEventListener("click", async () => {
    await fetch("/api/clear", { method: "POST" });
    showToast("History cleared.");
});

/* NAVIGATION */
function setupNavigation() {
    document.querySelectorAll(".nav-item[data-page]").forEach(item => {
        item.addEventListener("click", () => {
            document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            document.querySelectorAll(".page").forEach(sec => sec.classList.remove("active-page"));
            
            const page = item.dataset.page;
            document.getElementById(`${page}Page`).classList.add("active-page");
            
            const titles = { home: "Good music starts here.", downloads: "Your download activity.", library: "Your music library.", playlists: "Organize your music." };
            document.getElementById("pageTitle").textContent = titles[page] || "Music Downloader";
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

/* SETTINGS MODAL */
document.getElementById("settingsButton").addEventListener("click", () => settingsModal.classList.add("show"));
document.getElementById("topSettings").addEventListener("click", () => settingsModal.classList.add("show"));
closeSettings.addEventListener("click", () => settingsModal.classList.remove("show"));
saveSettings.addEventListener("click", () => settingsModal.classList.remove("show"));
window.addEventListener("click", e => { if (e.target === settingsModal) settingsModal.classList.remove("show"); });

/* LOCAL STORAGE */
function saveData() { localStorage.setItem("musicDownloaderSongs", JSON.stringify(songs)); }
function loadSavedData() {
    const savedSongs = localStorage.getItem("musicDownloaderSongs");
    if (savedSongs) songs = JSON.parse(savedSongs);
}

/* TOAST / UTILS */
let toastTimer;
function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHTML(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}