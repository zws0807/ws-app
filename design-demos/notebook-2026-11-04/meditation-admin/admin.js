const prefix = '/api/meditation/admin';
const login = document.querySelector('#login-panel');
const workspace = document.querySelector('#workspace');
const logout = document.querySelector('#logout');
const notice = document.querySelector('#notice');
const retryAudioList = document.querySelector('#retry-audio-list');
const trackList = document.querySelector('#tracks');
const uploadDialog = document.querySelector('#upload-dialog');
const openUpload = document.querySelector('#open-upload');
const closeUpload = document.querySelector('#close-upload');
const uploadError = document.querySelector('#upload-error');
const search = document.querySelector('#audio-search');
const categoryFilter = document.querySelector('#audio-category');
const clearFilters = document.querySelector('#clear-audio-filters');
const stateButtons = [...document.querySelectorAll('[data-audio-state]')];
const empty = document.querySelector('#audio-empty');
const statusLabels = { draft: '草稿', published: '已发布', archived: '已下架' };
let tracks = [];
let activeStatus = '';
let selectedTrackId = '';
let focusSelectedTrack = false;
let sessionVersion = 0;

function message(text, error = false) {
  notice.textContent = text;
  notice.toggleAttribute('data-error', error);
}

function showWorkspace(signedIn) {
  login.hidden = signedIn;
  workspace.hidden = logout.hidden = !signedIn;
  if (!signedIn) {
    sessionVersion++;
    tracks = [];
    trackList.replaceChildren();
    retryAudioList.hidden = true;
  }
  window.dispatchEvent(new CustomEvent('flowdo:audio-catalog', {
    detail: signedIn ? tracks : null,
  }));
}

async function api(path, options) {
  const response = await fetch(prefix + path, options);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) showWorkspace(false);
    throw new Error(data.message);
  }
  return data;
}

async function run(button, task, onError = (error) => message(error.message || '操作失败，请重试。', true)) {
  button.disabled = true;
  message('');
  try {
    await task();
  } catch (error) {
    onError(error);
  } finally {
    button.disabled = false;
  }
}

function action(text, secondary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (secondary) button.className = 'secondary';
  return button;
}

function renderTrack(track) {
  const row = document.createElement('li');
  row.dataset.trackId = track.id;
  row.tabIndex = -1;
  row.classList.toggle('track-highlight', track.id === selectedTrackId);
  const details = document.createElement('div');
  const title = document.createElement('strong');
  const metadata = document.createElement('div');
  metadata.className = 'track-meta';
  const category = document.createElement('span');
  const status = document.createElement('span');
  title.textContent = track.title;
  category.textContent = track.category;
  status.className = 'badge ' + (track.status === 'published' ? 'good' : 'neutral');
  status.textContent = statusLabels[track.status];
  metadata.append(category, status);
  details.append(title, metadata);
  const actions = document.createElement('div');
  actions.className = 'actions';
  const preview = action('试听', true);
  preview.onclick = () => {
    const existing = trackList.querySelector('audio');
    if (existing) {
      existing.pause();
      existing.remove();
    }
    const player = document.createElement('audio');
    player.controls = true;
    player.src = prefix + '/audio/' + track.id;
    player.addEventListener('error', () => message('无法播放这条音频，请检查文件或重新登录。', true));
    row.append(player);
    player.play().catch(() => {});
  };
  const published = track.status === 'published';
  const publish = action(published ? '下架' : track.status === 'archived' ? '重新发布' : '发布', published);
  publish.onclick = () => run(publish, async () => {
    const status = published ? 'archived' : 'published';
    const version = sessionVersion;
    await api('/tracks/' + track.id, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    notifyBook();
    if (version !== sessionVersion) return;
    tracks = tracks.map(item => item.id === track.id ? { ...item, status } : item);
    renderTracks();
    showWorkspace(true);
    const updated = [...trackList.children].find(item => item.dataset.trackId === track.id);
    (updated || stateButtons.find(button => button.dataset.audioState === activeStatus))?.focus();
    message(published ? `「${track.title}」已下架。` : `「${track.title}」已发布，可以在「我的冥想」查看。`);
  });
  actions.append(preview, publish);
  row.append(details, actions);
  return row;
}

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('flowdo-meditation-catalog') : null;
function notifyBook() {
  channel?.postMessage('updated');
}

function renderTracks() {
  const term = search.value.trim().toLowerCase();
  clearFilters.hidden = !(term || categoryFilter.value || activeStatus);
  const matching = tracks.filter(track =>
    track.title.toLowerCase().includes(term) && (!categoryFilter.value || track.category === categoryFilter.value));
  for (const button of stateButtons) {
    const status = button.dataset.audioState;
    button.setAttribute('aria-pressed', String(status === activeStatus));
    button.querySelector('span').textContent = status ?
      matching.filter(track => track.status === status).length : matching.length;
  }
  const visible = matching.filter(track => !activeStatus || track.status === activeStatus);
  trackList.querySelector('audio')?.pause();
  trackList.replaceChildren(...visible.map(renderTrack));
  empty.hidden = visible.length !== 0 || !retryAudioList.hidden;
  empty.textContent = tracks.length ? '没有符合筛选条件的音频。' : '还没有音频。上传第一条音频，保存为草稿。';
}

async function loadTracks() {
  const version = sessionVersion;
  const freshTracks = await api('/tracks');
  if (version !== sessionVersion) return false;
  tracks = freshTracks;
  retryAudioList.hidden = true;
  renderTracks();
  showWorkspace(true);
  focusLinkedTrack();
  return true;
}

retryAudioList.onclick = () => run(retryAudioList, async () => {
  if (await loadTracks()) {
    message('音频列表已更新。');
    search.focus();
  }
});

search.addEventListener('input', renderTracks);
categoryFilter.addEventListener('change', renderTracks);
clearFilters.onclick = () => {
  activeStatus = '';
  search.value = categoryFilter.value = '';
  renderTracks();
  search.focus();
};

function focusLinkedTrack() {
  if (!focusSelectedTrack || workspace.hidden) return;
  focusSelectedTrack = false;
  const row = trackList.querySelector('.track-highlight');
  if (row) row.focus();
  else message('找不到这条音频，已显示全部音频。', true);
}

function applyAudioRoute() {
  const match = /^#meditation(?:\/(draft|published|archived)|\/track\/([a-f0-9-]{36}))?$/.exec(location.hash);
  selectedTrackId = match?.[2] || '';
  focusSelectedTrack = Boolean(selectedTrackId);
  if (!match) return;
  activeStatus = match[1] || '';
  search.value = categoryFilter.value = '';
  if (!workspace.hidden) {
    renderTracks();
    focusLinkedTrack();
  }
}
window.addEventListener('hashchange', applyAudioRoute);
applyAudioRoute();
for (const button of stateButtons) {
  button.onclick = () => {
    activeStatus = button.dataset.audioState;
    renderTracks();
  };
}
openUpload.onclick = () => {
  uploadError.hidden = true;
  uploadDialog.showModal();
};
closeUpload.onclick = () => uploadDialog.close();
uploadDialog.addEventListener('cancel', (event) => {
  if (closeUpload.disabled) event.preventDefault();
});

document.querySelector('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  run(event.submitter, async () => {
    await api('/login', { method: 'POST', body: JSON.stringify({ code: form.elements.code.value }) });
    form.reset();
    await loadTracks();
  });
});

document.querySelector('#upload-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  uploadError.hidden = true;
  closeUpload.disabled = true;
  run(event.submitter, async () => {
    const file = form.elements.audio.files[0];
    if (!file?.size || file.size > 25 * 1024 * 1024) throw new Error('请选择一条不超过 25 MB 的音频。');
    const title = form.elements.title.value.trim();
    if (!title) throw new Error('请输入音频名称。');
    await api('/tracks', {
      method: 'POST',
      headers: {
        'x-track-title': encodeURIComponent(title),
        'x-track-category': encodeURIComponent(form.elements.category.value),
      },
      body: file,
    });
    form.reset();
    uploadDialog.close();
    activeStatus = 'draft';
    search.value = categoryFilter.value = '';
    try {
      if (await loadTracks()) message('已保存草稿，可以先试听。');
    } catch {
      if (workspace.hidden) {
        message('草稿已保存，请重新登录后查看。');
      } else {
        message('草稿已保存，音频列表暂时未更新。', true);
        retryAudioList.hidden = false;
        empty.hidden = true;
        retryAudioList.focus();
      }
    }
  }, (error) => {
    if (uploadDialog.open && !workspace.hidden) {
      uploadError.textContent = error.message;
      uploadError.hidden = false;
    } else {
      if (uploadDialog.open) uploadDialog.close();
      message(error.message, true);
    }
  }).finally(() => { closeUpload.disabled = false; });
});

logout.onclick = () => run(logout, async () => {
  await api('/logout', { method: 'POST' });
  showWorkspace(false);
  message('已退出登录。');
});

if (location.protocol === 'file:') {
  document.querySelector('#offline-panel').hidden = false;
} else {
  loadTracks().catch((error) => {
    if (login.hidden) {
      showWorkspace(false);
      message(error.message, true);
    }
  });
}
