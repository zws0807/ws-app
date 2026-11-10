(() => {
  const sections = [
    ['概览', [['overview','◈','工作台','查看运营概况和常用入口。']]],
    ['内容管理', [
      ['meditation','♫','冥想音频','管理五个冥想分类中的音频，先试听，再发布到手账。'],
      ['images','▧','愿望图片库','管理由运营者提供、可供用户选用的图片。'],
    ]],
    ['用户运营', [
      ['users','◎','用户管理','查看账号状态、注册信息和会员归属。'],
      ['members','◇','会员管理','查看年度会员状态与人工开通记录。'],
    ]],
    ['系统', [
      ['settings','⚙','功能设置','预览基础功能、会员权益和后续功能的配置。'],
      ['backups','↧','备份与恢复','查看备份覆盖范围、执行记录和恢复流程。'],
    ]],
  ];
  const pages = sections.flatMap(([, entries]) => entries);
  const tables = {
    images: {
      headers: ['图片名称','分类','状态','更新时间'], search: '搜索图片名称或分类', state: 2,
      rows: [
        ['晨雾山野','自然','已发布','2026-11-08'],
        ['落日海岸','自然','草稿','2026-11-07'],
        ['窗边的阅读时光','生活','已发布','2026-11-06'],
        ['给自己的书桌','学习与成长','已下架','2026-11-05'],
      ],
    },
    users: {
      headers: ['用户','手机号','账号状态','会员','注册日期'], search: '搜索用户或手机号尾号', state: 2,
      rows: [
        ['演示用户 A','138****0428','正常','年度会员','2026-11-08'],
        ['演示用户 B','136****1536','正常','普通用户','2026-11-07'],
        ['演示用户 C','139****2091','已停用','普通用户','2026-11-04'],
      ],
      note: '这里展示账号信息。用户的私人愿望照片、觉察日记、信念和计划仅在自己的手账中查看。',
    },
    members: {
      headers: ['用户','会员方案','状态','到期时间','开通方式'], search: '搜索会员或方案', state: 2,
      rows: [
        ['演示用户 A','年度会员','生效中','2027-11-08','管理员开通'],
        ['演示用户 D','年度会员','待开通','—','管理员开通'],
        ['演示用户 E','年度会员','已到期','2026-11-02','管理员开通'],
      ],
      note: '示例流程为选择用户、确认有效期、人工开通。权益和期限在正式接入前确认。',
      related: ['#settings', '查看会员 AI 规划 →'],
    },
    settings: {
      headers: ['功能','计划使用范围','当前状态','说明'], search: '搜索功能名称', state: 2,
      summary: '会员 AI 处于规划阶段。会员开通后，两项功能仍需分别接入和启用。启用后，由会员在手账中主动发起。',
      related: ['#members', '查看会员开通流程预览 →'],
      rows: [
        ['手账基础功能','基础功能','示例开启','自行填写、上传照片、计划与打卡'],
        ['运营图片库','会员权益草案','待接入','浏览与选用运营发布的图片'],
        ['正式冥想音频','会员权益草案','待确认','本地发布流程已接通'],
        ['联网搜图','会员权益草案','暂缓','按关键词找图'],
        ['「此刻的我」AI 内容整理','会员专享（规划）','暂未启用','由会员主动发起，整理自己的觉察记录'],
        ['「我的冥想」AI 定制','会员专享（规划）','暂未启用','由会员主动发起，按冥想意图定制跟练内容'],
      ],
    },
    backups: {
      headers: ['记录','覆盖范围','状态','时间'], search: '搜索备份名称或范围', state: 2,
      rows: [
        ['运营内容备份示例','音频、目录和运营图片','示例完成','2026-11-09 09:30'],
        ['账号数据备份示例','账号、手账记录和私人媒体','待接入','—'],
        ['恢复演练示例','先验证备份完整性，再恢复到测试环境','待接入','—'],
      ],
      note: '此页展示后台备份的操作入口和记录样式。个人手账导出与恢复另行接入。',
    },
  };
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nav = $('#navigation');
  let dashboardTracks = null;
  const dashboardStates = [
    ['draft', '待发布', '试听并确认草稿'],
    ['published', '已发布', '正在手账中展示'],
    ['archived', '已下架', '可以重新发布'],
  ];
  const uploadDate = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Shanghai', hourCycle: 'h23',
  });
  nav.innerHTML = sections.map(([group, entries]) => `
    <p class="nav-group">${group}</p>
    ${entries.map(([id, icon, title]) => `<a href="#${id}" data-page="${id}"><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</a>`).join('')}
  `).join('');

  function overview() {
    const signedIn = dashboardTracks !== null;
    const filePreview = location.protocol === 'file:';
    const drafts = dashboardTracks?.filter(track => track.status === 'draft').length || 0;
    return `<section class="hero">
      <div>
        <p class="eyebrow">冥想音频运营</p>
        <h2>${signedIn ? (drafts ? `有 ${drafts} 条草稿待发布` : '目前没有待发布的草稿') : '管理手账里的冥想音频'}</h2>
        <p>${signedIn ? '发布前可以试听，已发布的音频会出现在「我的冥想」。' : '管理员登录后可查看音频状态、上传记录和待发布草稿。'}</p>
        <a class="primary-link" href="${drafts ? '#meditation/draft' : '#meditation'}">${drafts ? '查看待发布草稿' : signedIn ? '进入音频管理' : filePreview ? '查看启动方式' : '登录并管理音频'} →</a>
      </div>
      <ol class="workflow" aria-label="音频发布步骤">
        <li><span>01</span> 上传并保存草稿</li>
        <li><span>02</span> 试听确认内容</li>
        <li><span>03</span> 发布到我的冥想</li>
      </ol>
    </section>
    ${signedIn ? `<div class="dashboard-status" aria-label="音频发布概况">
      ${dashboardStates.map(([status, label, description]) => `<a href="#meditation/${status}">
        <span>${label}</span><strong>${dashboardTracks.filter(track => track.status === status).length}</strong>
        <small>${description} →</small>
      </a>`).join('')}
    </div>
    <section class="recent-panel">
      <div class="section-heading"><h2>最近上传</h2><a href="#meditation">查看全部音频 →</a></div>
      ${dashboardTracks.length ? `<ul>${dashboardTracks.slice(0, 4).map(track => {
        const state = dashboardStates.find(([status]) => status === track.status);
        return `<li><div><strong><a class="recent-track" href="#meditation/track/${encodeURIComponent(track.id)}">${escape(track.title)}</a></strong><small>${escape(track.category)} · ${uploadDate.format(track.createdAt)}</small></div>
          <span class="badge ${track.status === 'published' ? 'good' : 'neutral'}">${state?.[1] || '未知状态'}</span></li>`;
      }).join('')}</ul>` : '<p class="panel-copy">上传第一条音频后，记录会出现在这里。</p>'}
    </section>` : ''}
    <section class="preview-section">
      <div class="section-heading"><div><h2>其他管理模块</h2><p class="panel-copy">点击查看页面、筛选方式和记录详情。</p></div><span class="badge neutral">演示数据</span></div>
      <div class="cards">
        ${pages.slice(2).map(([id, icon, title, description]) =>
          `<a href="#${id}"><strong><span class="card-icon" aria-hidden="true">${icon}</span>${title}</strong><span>${description}</span></a>`).join('')}
      </div>
    </section>`;
  }

  function showDetails(headers, row) {
    $('#detail-title').textContent = row[0];
    $('#detail-body').innerHTML = `<p class="panel-copy">演示记录</p><dl>${headers.slice(1).map((label, index) =>
      `<dt>${label}</dt><dd>${escape(row[index + 1])}</dd>`).join('')}</dl>`;
    $('#detail-dialog').showModal();
  }

  function table(data) {
    const { headers, rows, state, search, note, summary, related } = data;
    const choices = [...new Set(rows.map(row => row[state]))];
    const panel = $('#preview-page');
    const relatedLink = related ? `<a href="${related[0]}">${related[1]}</a>` : '';
    panel.innerHTML = `${summary ? `<div class="planning-note"><p>${summary}</p>${relatedLink}</div>` : ''}
    <section class="table-panel">
      <div class="table-tools">
        <input type="search" id="preview-search" aria-label="${search}" placeholder="${search}">
        <select id="preview-filter" aria-label="按状态筛选"><option value="">全部状态</option>${choices.map(status => `<option>${status}</option>`).join('')}</select>
      </div>
      <div class="table-scroll"><table>
        <thead><tr>${headers.map(title => `<th scope="col">${title}</th>`).join('')}<th scope="col">操作</th></tr></thead>
        <tbody id="preview-rows"></tbody>
      </table></div>
      <p class="empty" id="preview-empty" hidden>没有符合条件的记录。</p>
    </section>${note ? `<p class="panel-copy">${note} ${relatedLink}</p>` : ''}`;
    const query = $('#preview-search');
    const filter = $('#preview-filter');
    const results = $('#preview-rows');
    function renderRows() {
      const term = query.value.trim().toLowerCase();
      const shown = rows.filter(row => (!filter.value || row[state] === filter.value) &&
        row.some(value => value.toLowerCase().includes(term)));
      results.innerHTML = shown.map(row => `<tr>${row.map((value, index) => index === state ?
        `<td><span class="badge ${/^(已发布|正常|生效中|示例完成|示例开启)$/.test(value) ? 'good' : 'neutral'}">${escape(value)}</span></td>` :
        `<td>${escape(value)}</td>`).join('')}<td><button class="secondary" data-record="${rows.indexOf(row)}">查看详情</button></td></tr>`).join('');
      $('#preview-empty').hidden = shown.length > 0;
    }
    query.addEventListener('input', renderRows);
    filter.addEventListener('change', renderRows);
    results.onclick = (event) => {
      const button = event.target.closest('[data-record]');
      if (button) showDetails(headers, rows[Number(button.dataset.record)]);
    };
    renderRows();
  }

  function render() {
    const route = location.hash.split('/')[0];
    const page = pages.find(([id]) => route === '#' + id) || pages[0];
    const [id, , title, description] = page;
    const isAudio = id === 'meditation';
    $('#breadcrumb').textContent = '运营后台 / ' + title;
    $('#page-title').textContent = title;
    $('#page-description').textContent = description;
    const badge = $('#page-badge');
    badge.classList.toggle('live', isAudio && location.protocol !== 'file:');
    badge.textContent = id === 'overview' ? '本机工作台' :
      isAudio && location.protocol !== 'file:' ? '本机功能' : '演示预览';
    nav.querySelectorAll('[data-page]').forEach(link => {
      if (link.dataset.page === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('#preview-page').hidden = isAudio;
    $('#audio-page').hidden = !isAudio;
    if (!isAudio) $('#audio-page audio')?.pause();
    if (id === 'overview') $('#preview-page').innerHTML = overview();
    else if (!isAudio) table(tables[id]);
  }
  window.addEventListener('flowdo:audio-catalog', (event) => {
    dashboardTracks = event.detail;
    if (!location.hash || location.hash === '#overview') $('#preview-page').innerHTML = overview();
  });
  if (location.protocol === 'file:') $('#book-link').href = '../dir-1.html#meditation';
  window.addEventListener('hashchange', render);
  render();
})();
