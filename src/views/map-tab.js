import {FLOORS, FLOOR_NAMES} from '../app-config.js';
import {floorMapMarkup, wireFloorMap} from '../floor-map.js';
import {floorGeoData} from '../floor-map-geo.js';
import {esc, workStatus} from '../app/ui-helpers.js';

export function navigationPanel(ctx, view, plan) {
  const {works, byId} = ctx;
  if (!plan.routableIds.length) {
    return `<section class="route-guidance route-empty">
      <div><span class="guidance-label">マイプラン案内</span><strong>マップ対応作品がまだ選ばれていません</strong></div>
      <p>「音声一覧」から展示室確認済みの作品を ★ 追加すると、入口からの最短ルートが表示されます。</p>
      <button class="secondary compact-btn" type="button" data-go-audio-mapped>マップ対応作品を見る（${works.filter(w => w.locationPrecision === 'room').length}作品）</button>
    </section>`;
  }
  if (!view.available) {
    return `<section class="route-guidance route-unavailable" role="status">
      <div><span class="guidance-label">経路を表示できません</span><strong>${esc(view.reason)}</strong></div>
      <p>壁を横断する推測線は表示しません。接続データの追加後に再計算できます。</p>
    </section>`;
  }
  const locationLabel = view.locationMethod === 'selection'
    ? '区間の開始地点'
    : ['audio', 'manual'].includes(view.locationMethod)
      ? '推定現在地'
      : '最後に確認した地点';
  if (view.complete) {
    return `<section class="route-guidance route-complete" aria-label="ルート完了">
      <div class="guidance-points">
        <div><span class="guidance-label">${locationLabel}</span><strong><i class="current-symbol"></i>${esc(view.currentNode.label)}</strong></div>
        <span class="guidance-arrow" aria-hidden="true">✓</span>
        <div><span class="guidance-label">進行状況</span><strong class="destination-name">ルート完了！</strong></div>
      </div>
      <p class="next-action"><span>おつかれさまでした</span>気になる作品があれば、マップ上のピンや音声一覧から自由に鑑賞できます。</p>
    </section>`;
  }
  const destinationWork = byId[view.destinationNode.workId];
  const transition = view.transitions[0];
  const estimates = ctx.currentEstimates();
  const destEst = destinationWork ? estimates[destinationWork.id] : null;
  return `<section class="route-guidance" aria-label="現在地から次の作品まで">
    <div class="guidance-points">
      <div>
        <span class="guidance-label">${locationLabel}</span>
        <strong><i class="current-symbol"></i>${esc(view.currentNode.label)}</strong>
      </div>
      <span class="guidance-arrow" aria-hidden="true">→</span>
      <button class="guidance-dest-btn" type="button" data-open-detail="${esc(destinationWork?.id || '')}">
        <span class="guidance-label">次の目的地（タップで詳細）</span>
        <strong class="destination-name">${esc(destinationWork?.title ?? view.destinationNode.label)}</strong>
        <small>${destinationWork ? esc(workStatus(destinationWork)) : ''}${destEst ? ` · ${esc(destEst.elapsedLabel)}` : ''}</small>
      </button>
    </div>
    <p class="next-action"><span>次にすること</span>${esc(view.nextAction)}</p>
    ${transition ? `<p class="transition-summary">${transition.to.floor > transition.from.floor ? '↑' : '↓'} ${esc(transition.message)}</p>` : ''}
  </section>`;
}

export function movementSupportMarkup(ctx) {
  const support = ctx.state.support;
  const candidates = support.candidates.length
    ? `<fieldset class="room-candidates">
        <legend>${support.candidates.length > 1 ? '翼と階を確認して選択してください' : '入力した部屋を確認してください'}</legend>
        ${support.candidates.map(candidate => `<label><input type="radio" name="room-candidate" value="${esc(candidate.nodeId)}" ${support.selectedCandidateId === candidate.nodeId ? 'checked' : ''}><span><strong>${esc(candidate.room)}室</strong><small>${esc(candidate.wing)}翼 · ${esc(candidate.floorLabel)}</small></span></label>`).join('')}
      </fieldset>
      <button class="primary confirm-location" type="button" data-confirm-location>この部屋を推定現在地にする</button>`
    : '';
  const editor = support.editing
    ? `<form class="room-correction-form" data-room-search novalidate>
        <label for="room-number">部屋番号</label>
        <div class="room-input-row">
          <input id="room-number" name="room" inputmode="numeric" autocomplete="off" value="${esc(support.room)}" placeholder="例：711" aria-describedby="room-help room-error">
          <button class="secondary" type="submit">候補を確認</button>
        </div>
        <small id="room-help">入口付近や壁面に表示された番号を入力してください。</small>
        ${support.error ? `<p class="room-error" id="room-error" role="alert">${esc(support.error)}</p>` : ''}
        ${candidates}
      </form>`
    : '';
  return `<details class="movement-support" ${support.open ? 'open' : ''}>
    <summary>移動サポート（道に迷ったとき）</summary>
    <div class="movement-support-body">
      <button class="location-correction-trigger" type="button" data-edit-location>
        <span>現在地を修正する</span>
        <small>近くの展示室番号から最短ルートを再計算します</small>
      </button>
      ${editor}
    </div>
  </details>`;
}

export function mapTabView(ctx, hasMini) {
  const {state, works, navigationGraph} = ctx;
  const plan = ctx.currentPlan();
  const nav = ctx.navigationView();
  const destinationId = nav.destinationNode?.workId ?? null;
  const destinationFloor = !nav.complete && Number.isFinite(nav.destinationNode?.floor)
    ? nav.destinationNode.floor
    : null;
  const floorWorkCounts = Object.fromEntries(FLOORS.map(f => {
    const anchors = floorGeoData.floors[String(f)]?.roomAnchors || {};
    return [f, works.filter(w => w.floor === f && w.locationPrecision === 'room' && Boolean(anchors[String(w.room)])).length];
  }));
  const viewedInPlan = ctx.planWorks().filter(w => state.viewed.has(w.id)).length;
  const currentFloorGeo = floorGeoData.floors[String(state.floor)];
  const wcCount = (currentFloorGeo?.facilities || []).filter(item => item.type === 'wc').length;
  const cafeCount = (currentFloorGeo?.facilities || []).filter(item => item.type === 'cafe').length;
  const emptyOrCompleteNote = !plan.routableIds.length
    ? `<section class="route-guidance route-empty">
        <div><span class="guidance-label">マイプラン案内</span><strong>マップ対応作品がまだ選ばれていません</strong></div>
        <p>「音声一覧」から展示室確認済みの作品を ★ 追加すると、入口からの最短ルートが表示されます。</p>
        <button class="secondary compact-btn" type="button" data-go-audio-mapped>マップ対応作品を見る（${works.filter(w => w.locationPrecision === 'room').length}作品）</button>
      </section>`
    : nav.complete
      ? `<section class="route-guidance route-complete" aria-label="ルート完了">
          <p class="next-action"><span>ルート完了！</span>おつかれさまでした。気になる作品があればマップ上のピンや音声一覧から自由に鑑賞できます。</p>
        </section>`
      : '';

  return `<main class="tab-screen map-screen ${hasMini ? 'has-mini-player' : ''}">
    <div class="map-frame">
      <div class="map-scroll">
        ${floorMapMarkup({
          floor: state.floor,
          floorLabel: FLOOR_NAMES[state.floor],
          works,
          selectedId: destinationId,
          navigation: nav,
          roomNotices: navigationGraph.roomNotices,
          routeWorkIds: plan.routableIds,
          viewedIds: state.viewed,
          facilityFilter: state.facilityFilter
        })}
      </div>
      <div class="map-controls" aria-label="地図の拡大縮小">
        <button type="button" data-map-action="in" aria-label="地図を拡大">＋</button>
        <output data-map-status aria-live="polite">100%</output>
        <button type="button" data-map-action="out" aria-label="地図を縮小">−</button>
        <button type="button" data-map-action="reset">全体</button>
      </div>
    </div>

    <div class="floor-tabs map-floor-tabs-below" role="tablist" aria-label="表示する階">
      ${FLOORS.map(floor => {
        const hasRoute = nav.routeFloors?.includes(floor);
        const isDestinationFloor = destinationFloor === floor;
        const count = floorWorkCounts[floor];
        const ariaLabel = isDestinationFloor
          ? `${FLOOR_NAMES[floor]}（次の作品あり）`
          : FLOOR_NAMES[floor];
        return `<button type="button" data-floor="${floor}"${isDestinationFloor ? ' data-destination-floor="true"' : ''} class="${floor === state.floor ? 'active' : ''} ${hasRoute ? 'has-route' : ''} ${isDestinationFloor ? 'has-destination' : ''}" aria-pressed="${floor === state.floor}" aria-label="${esc(ariaLabel)}">
          ${isDestinationFloor ? '<em class="floor-next-badge">次の作品</em>' : ''}
          <span>${FLOOR_NAMES[floor]}</span>
          ${count ? `<small>${count}作</small>` : ''}
          ${hasRoute && !isDestinationFloor ? '<i aria-hidden="true"></i>' : ''}
        </button>`;
      }).join('')}
    </div>

    <div class="map-subbar" aria-label="施設ピックアップと経路モード">
      <div class="map-subtabs" role="tablist" aria-label="施設を強調表示">
        <button type="button" class="${state.facilityFilter === 'none' ? 'active' : ''}" data-facility-filter="none">作品表示</button>
        <button type="button" class="${state.facilityFilter === 'wc' ? 'active' : ''}" data-facility-filter="wc">トイレ (${wcCount})</button>
        <button type="button" class="${state.facilityFilter === 'cafe' ? 'active' : ''}" data-facility-filter="cafe">カフェ (${cafeCount})</button>
      </div>
      <div class="route-mode-subtoggle" role="group" aria-label="経路優先切替">
        <button type="button" class="${!state.preferElevator ? 'active' : ''}" data-prefer-elevator="false">最短距離</button>
        <button type="button" class="${state.preferElevator ? 'active' : ''}" data-prefer-elevator="true">EV優先</button>
      </div>
    </div>

    <div class="map-toolbar map-toolbar-below">
      <div class="map-toolbar-meta">
        <strong>${esc(plan.label)}</strong>
        <span>${viewedInPlan} / ${plan.ids.length}作品 鑑賞済み</span>
      </div>
      <button type="button" class="pill-action-btn" data-open-plan>プラン一覧を見る ›</button>
    </div>

    ${emptyOrCompleteNote}
    ${state.facilityFilter === 'wc' && wcCount === 0 ? '<p class="map-tip">この階にトイレ情報はありません。他の階タブでご確認ください。</p>' : state.facilityFilter === 'cafe' && cafeCount === 0 ? '<p class="map-tip">この階にカフェ情報はありません（−2階・−1階・1階にあります）。</p>' : '<p class="map-tip">ピンをタップすると作品の詳細・音声再生が開きます（数字は回る順番、✓は鑑賞済み）。</p>'}
    ${movementSupportMarkup(ctx)}
  </main>`;
}

export function wireMapTab(ctx) {
  const {state, planActions} = ctx;

  document.querySelectorAll('[data-facility-filter]').forEach(btn => {
    btn.onclick = () => {
      state.facilityFilter = btn.dataset.facilityFilter;
      ctx.render();
    };
  });
  document.querySelectorAll('[data-open-plan]').forEach(btn => {
    btn.onclick = () => {
      state.tab = 'plan';
      state.detailWorkId = null;
      ctx.persistState();
      ctx.render();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
  });

  document.querySelectorAll('button[data-floor]').forEach(btn => {
    btn.onclick = () => {
      state.floor = Number(btn.dataset.floor);
      ctx.persistState();
      ctx.render();
    };
  });

  const supportDetails = document.querySelector('.movement-support');
  if (supportDetails) supportDetails.ontoggle = () => { state.support.open = supportDetails.open; };
  document.querySelectorAll('[data-edit-location]').forEach(btn => {
    btn.onclick = () => {
      state.support.open = true;
      state.support.editing = true;
      state.support.error = '';
      ctx.render();
      document.querySelector('#room-number')?.focus();
    };
  });
  document.querySelectorAll('[data-room-search]').forEach(form => {
    form.onsubmit = event => {
      event.preventDefault();
      planActions.lookupRoom(new FormData(form).get('room'));
    };
  });
  document.querySelectorAll('[name="room-candidate"]').forEach(input => {
    input.onchange = () => {
      state.support.selectedCandidateId = input.value;
      state.support.error = '';
      document.querySelector('.room-error')?.remove();
    };
  });
  document.querySelectorAll('[data-confirm-location]').forEach(btn => {
    btn.onclick = planActions.confirmLocationCorrection;
  });

  wireFloorMap({
    onWorkSelect: (id, roomWorkIds) => {
      ctx.openWorkDetail(id, roomWorkIds);
    }
  });
}
