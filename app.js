(() => {
  'use strict';
  const KEYS = { tasks: 'gunluk-program:default-tasks:v1', records: 'gunluk-program:records:v1' };
  const ratingLabels = ['Çok kötü','Kötü','Oldukça kötü','İyi değildi','Orta','Fena değil','İyi','Çok iyi','Harika','Mükemmel'];
  const starterTasks = [
    ['Tuv/Ytk/Giy','25 dk'], ['Diş fırçalama','5 dk'], ['Kitap oku','30 dk'], ['Ders ödevi','1 saat'], ['Ders çalışma','1 saat'],
    ['Matematik','1 saat'], ['Sayfa oku','30 dk'], ['Para Hesabı','15 dk'], ['Kuran meali','15 dk'], ['5 vakit namaz','20 dk']
  ].map(([name,duration]) => ({ id: uid(), name, duration }));
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const safeParse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
  const storage = {
    getTasks: () => { const data = safeParse(localStorage.getItem(KEYS.tasks), null); return Array.isArray(data) ? data : starterTasks; },
    setTasks: tasks => localStorage.setItem(KEYS.tasks, JSON.stringify(tasks)),
    getRecords: () => { const data = safeParse(localStorage.getItem(KEYS.records), {}); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; },
    setRecord: (date, record) => { const records = storage.getRecords(); records[date] = record; localStorage.setItem(KEYS.records, JSON.stringify(records)); }
  };
  let defaults = storage.getTasks();
  if (!localStorage.getItem(KEYS.tasks)) storage.setTasks(defaults);
  let currentDate = todayKey();
  let currentRecord;
  let noteTimer;
  let toastTimer;
  let calendarMonth;

  function uid(){ return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`; }
  function todayKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function parseDate(key){ const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); }
  function dateKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function formatDate(key, options={weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}){ return new Intl.DateTimeFormat('tr-TR',options).format(parseDate(key)); }
  function ensureRecord(key){
    const records = storage.getRecords();
    const previousDate=parseDate(key);previousDate.setDate(previousDate.getDate()-1);
    const previousRecord=records[dateKey(previousDate)];
    if (records[key]) {
      const existing=records[key];
      // Önceki sürümde boş kayıt olarak açılmış yarınları ilk kez görev planıyla doldur.
      if(key>=todayKey()&&existing.taskListCustomized!==true&&Array.isArray(existing.tasks)&&existing.tasks.length===0&&!existing.note&&!existing.rating&&previousRecord&&Array.isArray(previousRecord.tasks)&&previousRecord.tasks.length){
        existing.tasks=previousRecord.tasks.map(task=>({...task,id:uid(),completed:false}));
        existing.taskListInherited=true;
        storage.setRecord(key,existing);
      }
      return existing;
    }
    // Yeni gün, bir önceki günün görev planıyla başlar; durum ve günlük bilgiler sıfırdır.
    const tasks=previousRecord&&Array.isArray(previousRecord.tasks)
      ? previousRecord.tasks.map(task=>({...task,id:uid(),completed:false}))
      : [];
    const fresh = { date:key, tasks, note:'', rating:null, taskListCustomized:false };
    storage.setRecord(key,fresh); return fresh;
  }
  function normalizeLegacyEmptyDays(){
    if(localStorage.getItem('gunluk-program:empty-days-migration:v1'))return;
    const records=storage.getRecords();let changed=false;
    Object.entries(records).forEach(([key,record])=>{
      if(record&&Array.isArray(record.tasks)&&record.tasks.length===starterTasks.length&&record.tasks.every((task,index)=>task.name===starterTasks[index]?.name&&task.duration===starterTasks[index]?.duration&&!task.completed)&&!record.note&&!record.rating){record.tasks=[];changed=true;}
    });
    if(changed)localStorage.setItem(KEYS.records,JSON.stringify(records));
    localStorage.setItem('gunluk-program:empty-days-migration:v1','1');
  }
  function persist(){ storage.setRecord(currentDate,currentRecord); }
  function renderDate(){ $('#selected-date').textContent = formatDate(currentDate,{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}); $('#topbar-date').textContent = formatDate(todayKey(),{day:'numeric',month:'long',year:'numeric'}); }
  function renderCalendar(){
    const title=$('#calendar-month'),grid=$('#calendar-grid');
    title.textContent=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(calendarMonth);
    grid.innerHTML='';['Pt','Sa','Ça','Pe','Cu','Ct','Pa'].forEach((day,index)=>{const el=document.createElement('span');el.className=`calendar-weekday${index>4?' weekend':''}`;el.textContent=day;grid.append(el);});
    const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),offset=(new Date(year,month,1,12).getDay()+6)%7,days=new Date(year,month+1,0,12).getDate(),prevDays=new Date(year,month,0,12).getDate();
    for(let cell=0;cell<42;cell++){
      const dayNum=cell-offset+1;let date,muted=false;
      if(dayNum<1){date=new Date(year,month-1,prevDays+dayNum,12);muted=true;}else if(dayNum>days){date=new Date(year,month+1,dayNum-days,12);muted=true;}else date=new Date(year,month,dayNum,12);
      const key=dateKey(date),button=document.createElement('button');button.type='button';button.className=`calendar-day${muted?' outside':''}${key===currentDate?' selected':''}${key===todayKey()?' today':''}${(cell%7)>4?' weekend':''}`;button.textContent=date.getDate();button.dataset.date=key;button.setAttribute('role','gridcell');button.setAttribute('aria-label',formatDate(key,{weekday:'long',day:'numeric',month:'long',year:'numeric'}));button.setAttribute('aria-selected',String(key===currentDate));grid.append(button);
    }
  }
  function openCalendar(){const date=parseDate(currentDate);calendarMonth=new Date(date.getFullYear(),date.getMonth(),1,12);renderCalendar();$('#calendar-popover').hidden=false;$('#calendar-popover').classList.remove('is-closing');requestAnimationFrame(()=>$('#calendar-popover').classList.add('is-open'));$('#date-display').setAttribute('aria-expanded','true');}
  function closeCalendar({restoreFocus=false}={}){const popover=$('#calendar-popover');if(!popover.hidden){popover.classList.remove('is-open');popover.classList.add('is-closing');window.setTimeout(()=>{if(!popover.classList.contains('is-open')){popover.hidden=true;popover.classList.remove('is-closing');}},260);}$('#date-display').setAttribute('aria-expanded','false');if(restoreFocus)$('#date-display').focus({preventScroll:true}); }
  function renderDaily(){
    renderDate(); const tbody=$('#task-rows'); tbody.innerHTML='';
    currentRecord.tasks.forEach((task,index)=>{
      const tr=document.createElement('tr'); tr.className=`task-row${task.completed?' is-complete':''}`;
      tr.innerHTML=`<td><span class="task-name"></span></td><td class="task-duration"></td><td class="check-cell"><input class="task-check" type="checkbox" aria-label="Görevi tamamlandı olarak işaretle"></td>`;
      $('.task-name',tr).textContent=task.name; $('.task-duration',tr).textContent=task.duration;
      const check=$('.task-check',tr); check.checked=!!task.completed; check.dataset.index=index;
      tbody.append(tr);
      const remove=document.createElement('button');remove.type='button';remove.className='daily-task-delete';remove.textContent='×';remove.setAttribute('aria-label',`${task.name} görevini sil`);remove.dataset.index=index;tr.lastElementChild.append(' ',remove);
    });
    $('#task-count').textContent=currentRecord.tasks.length?`${currentRecord.tasks.length} görev`:'Bu gün için görev eklenmedi';
    $('#daily-add-task-form').hidden=currentRecord.tasks.length>0;
    $('#daily-note').value=currentRecord.note||''; renderRating(); updateCompletion();
  }
  function updateCompletion(){
    const total=currentRecord.tasks.length, done=currentRecord.tasks.filter(task=>task.completed).length, pct=total?Math.round(done/total*100):0;
    $('#completion-summary').textContent=total?`${done} / ${total} görev tamamlandı`:'Henüz görev yok'; $('#completion-pct').textContent=`%${pct}`; $('#progress-bar').style.width=`${pct}%`;
  }
  function renderRating(){
    const box=$('#rating-scale'); box.innerHTML='';
    ratingLabels.forEach((label,index)=>{ const value=index+1,button=document.createElement('button'); button.type='button'; button.className=`rating-option rating-${value}${currentRecord.rating===value?' selected':''}`; button.textContent=value; button.setAttribute('role','radio'); button.setAttribute('aria-checked',String(currentRecord.rating===value)); button.setAttribute('aria-label',`${value} — ${label}`); button.dataset.rating=value; box.append(button); });
    $('#rating-result').innerHTML=currentRecord.rating?`Seçimin: <strong>${currentRecord.rating} — ${ratingLabels[currentRecord.rating-1]}</strong>`:'Henüz değerlendirme yapılmadı';
  }
  function navigateDate(key){ currentDate=key; currentRecord=ensureRecord(key); renderDaily(); }
  function showToast(message){ const toast=$('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200); }
  function applyTheme(theme){const dark=theme==='dark',toggle=$('#theme-toggle');document.documentElement.dataset.theme=dark?'dark':'light';$('#theme-toggle-label').textContent=dark?'Beyaz mod':'Karanlık mod';$('#theme-toggle-icon').textContent=dark?'☀':'☾';toggle.setAttribute('aria-pressed',String(dark));toggle.setAttribute('aria-label',dark?'Beyaz moda geç':'Karanlık moda geç');$('#mobile-theme-toggle').textContent=dark?'☀':'☾';$('#mobile-theme-toggle').setAttribute('aria-label',dark?'Beyaz moda geç':'Karanlık moda geç');localStorage.setItem('gunluk-program:theme:v1',dark?'dark':'light');}
  function switchView(name){
    $$('.view').forEach(view=>view.classList.toggle('active',view.id===`view-${name}`));
    $$('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.view===name));
    if(name==='analysis')renderAnalysis(); if(name==='settings')renderSettings();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function renderSettings(){
    const tbody=$('#settings-rows');tbody.innerHTML='';
    defaults.forEach((task,index)=>{
      const tr=document.createElement('tr');tr.innerHTML='<td><input class="settings-input name-input" type="text" maxlength="100" aria-label="Görev adı"></td><td><input class="settings-input duration-input" type="text" maxlength="30" aria-label="Görev süresi"></td><td class="settings-actions"><div class="move-group"><button class="small-action move-up" type="button" aria-label="Yukarı taşı">↑</button><button class="small-action move-down" type="button" aria-label="Aşağı taşı">↓</button><button class="delete-action" type="button" aria-label="Görevi sil">×</button></div></td>';
      $('.name-input',tr).value=task.name;$('.duration-input',tr).value=task.duration;
      $$('.settings-input',tr).forEach(input=>input.addEventListener('change',()=>{const name=$('.name-input',tr).value.trim(),duration=$('.duration-input',tr).value.trim();if(!name||!duration){showToast('Görev adı ve süresi boş bırakılamaz.');renderSettings();return;}defaults[index]={...defaults[index],name,duration};storage.setTasks(defaults);showToast('Varsayılan görev güncellendi.');}));
      $('.move-up',tr).disabled=index===0;$('.move-down',tr).disabled=index===defaults.length-1;
      $('.move-up',tr).addEventListener('click',()=>moveTask(index,-1));$('.move-down',tr).addEventListener('click',()=>moveTask(index,1));
      $('.delete-action',tr).addEventListener('click',()=>{defaults.splice(index,1);storage.setTasks(defaults);renderSettings();showToast('Görev varsayılan listeden silindi.');});tbody.append(tr);
    });
  }
  function moveTask(index,offset){const next=index+offset;if(next<0||next>=defaults.length)return;[defaults[index],defaults[next]]=[defaults[next],defaults[index]];storage.setTasks(defaults);renderSettings();}
  function averageBetween(start,end){const records=storage.getRecords();const values=Object.values(records).filter(record=>record.date>=start&&record.date<=end&&Number.isInteger(record.rating)&&record.rating>=1&&record.rating<=10).map(record=>record.rating);return{count:values.length,avg:values.length?(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1):null};}
  function renderAnalysis(){
    const end=todayKey(),endDate=parseDate(end),start7=new Date(endDate);start7.setDate(start7.getDate()-6);const start30=new Date(endDate);start30.setDate(start30.getDate()-29);
    const a7=averageBetween(dateKey(start7),end),a30=averageBetween(dateKey(start30),end);
    $('#avg-7').textContent=a7.avg??'—';$('#count-7').textContent=a7.count?`${a7.count} gün değerlendirildi`:'Değerlendirme bekleniyor';
    $('#avg-30').textContent=a30.avg??'—';$('#count-30').textContent=a30.count?`${a30.count} gün değerlendirildi`:'Değerlendirme bekleniyor';
    renderRatingChart(endDate);renderAverageChart(a7,a30);
    renderTaskInsights(end);
    const rated=Object.values(storage.getRecords()).filter(record=>Number.isInteger(record.rating)&&record.rating>=1&&record.rating<=10).sort((x,y)=>x.date.localeCompare(y.date));
    const best=rated.length?rated.filter(r=>r.rating===Math.max(...rated.map(x=>x.rating))).at(-1):null,worst=rated.length?rated.filter(r=>r.rating===Math.min(...rated.map(x=>x.rating))).at(-1):null;
    $('#best-day').innerHTML=best?`<strong>${best.rating}</strong> ${escapeHtml(ratingLabels[best.rating-1])}<br><span class="muted">${escapeHtml(formatDate(best.date,{day:'numeric',month:'long',year:'numeric'}))}</span>`:'Henüz değerlendirme yok';
    $('#worst-day').innerHTML=worst?`<strong>${worst.rating}</strong> ${escapeHtml(ratingLabels[worst.rating-1])}<br><span class="muted">${escapeHtml(formatDate(worst.date,{day:'numeric',month:'long',year:'numeric'}))}</span>`:'Henüz değerlendirme yok';
    const history=$('#completion-history');const days=Object.values(storage.getRecords()).filter(r=>Array.isArray(r.tasks)&&r.date<=end).sort((x,y)=>y.date.localeCompare(x.date));history.innerHTML='';
    if(!days.length){history.innerHTML='<div class="empty-state">Henüz günlük kayıt bulunmuyor.</div>';return;}
    days.forEach(record=>{const done=record.tasks.filter(t=>t.completed).length,total=record.tasks.length,pct=total?Math.round(done/total*100):0;const row=document.createElement('div');row.className=`history-row ${pct>=70?'positive-row':pct<40&&total?'negative-row':''}`;row.innerHTML=`<span class="history-date">${escapeHtml(formatDate(record.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</span><span class="history-ratio">${done} / ${total} görev</span><span class="history-bar"><span style="width:${pct}%"></span></span><span class="history-pct">%${pct}</span>`;history.append(row);});
  }
  function renderRatingChart(endDate){
    const chart=$('#rating-chart');chart.innerHTML='';const records=storage.getRecords();
    for(let offset=13;offset>=0;offset--){const date=new Date(endDate);date.setDate(date.getDate()-offset);const key=dateKey(date),record=records[key],col=document.createElement('div');col.className='rating-chart-column';
      const plot=document.createElement('div');plot.className='rating-chart-plot';const grid=document.createElement('span');grid.className='chart-gridline line-mid';plot.append(grid);
      if(record&&Number.isInteger(record.rating)){const bar=document.createElement('span');bar.className=`rating-chart-bar ${record.rating<=4?'low-rating':record.rating>=7?'high-rating':'mid-rating'}`;bar.style.height=`${record.rating*10}%`;bar.title=`${formatDate(key,{day:'numeric',month:'long'})}: ${record.rating} — ${ratingLabels[record.rating-1]}`;bar.setAttribute('aria-label',bar.title);plot.append(bar);}else{const blank=document.createElement('span');blank.className='rating-chart-empty';blank.title=`${formatDate(key,{day:'numeric',month:'long'})}: değerlendirme yok`;plot.append(blank);}
      const label=document.createElement('span');label.className='rating-chart-label';label.textContent=new Intl.DateTimeFormat('tr-TR',{day:'numeric'}).format(date);label.title=formatDate(key,{day:'numeric',month:'long'});col.append(plot,label);chart.append(col);
    }
  }
  function renderAverageChart(a7,a30){
    const chart=$('#average-chart');chart.innerHTML='';
    [['Son 7 gün',a7],['Son 30 gün',a30]].forEach(([label,data])=>{const row=document.createElement('div');row.className=`average-chart-row ${data.avg&&Number(data.avg)<=4?'low-rating':data.avg&&Number(data.avg)>=7?'high-rating':'mid-rating'}`;const head=document.createElement('div');head.className='average-chart-head';head.innerHTML=`<span>${label}</span><strong>${data.avg??'—'}${data.avg?' / 10':''}</strong>`;const track=document.createElement('div');track.className='average-track';const fill=document.createElement('span');fill.className='average-fill';fill.style.width=`${data.avg?Number(data.avg)*10:0}%`;track.append(fill);const foot=document.createElement('div');foot.className='average-foot';foot.textContent=`${data.count} gün değerlendirildi`;row.append(head,track,foot);chart.append(row);});
  }
  function renderTaskInsights(end){
    const records=Object.values(storage.getRecords()).filter(record=>record.date<=end&&Array.isArray(record.tasks)).sort((a,b)=>a.date.localeCompare(b.date));
    const stats=new Map();
    records.forEach(record=>record.tasks.forEach(task=>{const name=(task.name||'').trim();if(!name)return;const stat=stats.get(name)||{name,done:0,total:0};stat.total++;if(task.completed)stat.done++;stats.set(name,stat);}));
    const all=[...stats.values()].filter(stat=>stat.total>0),completed=$('#most-completed-tasks'),incomplete=$('#least-completed-tasks');
    renderTaskInsightList(completed,[...all].sort((a,b)=>b.done-a.done||(b.done/b.total)-(a.done/a.total)).slice(0,5),'Henüz tamamlanmış görev verisi yok.','done');
    renderTaskInsightList(incomplete,[...all].filter(stat=>stat.total-stat.done>0).sort((a,b)=>(b.total-b.done)-(a.total-a.done)||(a.done/a.total)-(b.done/b.total)).slice(0,5),'Henüz tamamlanmadan kalan görev yok.','remaining');
    const chart=$('#task-trend-chart');chart.innerHTML='';const trend=records.slice(-14);
    if(!trend.length){chart.innerHTML='<div class="empty-state">Henüz görev kaydı yok.</div>';return;}
    trend.forEach(record=>{const total=record.tasks.length,done=record.tasks.filter(task=>task.completed).length,pct=total?Math.round(done/total*100):0;const column=document.createElement('div');column.className='task-trend-column';const plot=document.createElement('div');plot.className='task-trend-plot';const guide=document.createElement('span');guide.className='task-trend-guide';plot.append(guide);if(total){const bar=document.createElement('span');bar.className=`task-trend-bar ${pct>=70?'good':pct<40?'low':'mid'}`;bar.style.height=`${pct}%`;bar.title=`${formatDate(record.date,{day:'numeric',month:'long'})}: ${done}/${total} görev (%${pct})`;bar.setAttribute('aria-label',bar.title);plot.append(bar);}else{const empty=document.createElement('span');empty.className='task-trend-empty';empty.title=`${formatDate(record.date,{day:'numeric',month:'long'})}: görev yok`;plot.append(empty);}const label=document.createElement('span');label.className='task-trend-label';label.textContent=new Intl.DateTimeFormat('tr-TR',{day:'numeric'}).format(parseDate(record.date));column.append(plot,label);chart.append(column);});
  }
  function renderTaskInsightList(container,list,emptyMessage,mode){
    container.innerHTML='';if(!list.length){container.innerHTML=`<div class="empty-state">${emptyMessage}</div>`;return;}
    list.forEach(stat=>{const ratio=Math.round(stat.done/stat.total*100),amount=mode==='done'?stat.done:stat.total-stat.done,row=document.createElement('div');row.className='task-insight-row';const info=document.createElement('div');info.className='task-insight-info';const name=document.createElement('span');name.className='task-insight-name';name.textContent=stat.name;const value=document.createElement('strong');value.textContent=mode==='done'?`${amount} kez`:`${amount} gün`;info.append(name,value);const track=document.createElement('div');track.className='task-insight-track';const fill=document.createElement('span');fill.style.width=`${mode==='done'?ratio:100-ratio}%`;fill.className=mode==='done'?'good':'remaining';track.append(fill);const foot=document.createElement('div');foot.className='task-insight-foot';foot.textContent=`${stat.done} / ${stat.total} gün · %${ratio}`;row.append(info,track,foot);container.append(row);});
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function init(){
    normalizeLegacyEmptyDays();
    currentRecord=ensureRecord(currentDate);renderDaily();
    $$('.nav-item').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.view)));
    $$('[data-go]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.go)));
    applyTheme(localStorage.getItem('gunluk-program:theme:v1')==='dark'?'dark':'light');
    const toggleTheme=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
    $('#theme-toggle').addEventListener('click',toggleTheme);$('#mobile-theme-toggle').addEventListener('click',toggleTheme);
    $('#prev-day').addEventListener('click',()=>{const d=parseDate(currentDate);d.setDate(d.getDate()-1);navigateDate(dateKey(d));});
    $('#next-day').addEventListener('click',()=>{const d=parseDate(currentDate);d.setDate(d.getDate()+1);navigateDate(dateKey(d));});
    $('#date-display').addEventListener('click',()=>$('#calendar-popover').hidden?openCalendar():closeCalendar());
    $('#calendar-prev').addEventListener('click',()=>{calendarMonth.setMonth(calendarMonth.getMonth()-1);renderCalendar();});$('#calendar-next').addEventListener('click',()=>{calendarMonth.setMonth(calendarMonth.getMonth()+1);renderCalendar();});
    $('#calendar-month').addEventListener('click',()=>{const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();const answer=window.prompt('Ay ve yıl girin (AA.YYYY):',`${String(month+1).padStart(2,'0')}.${year}`);if(!answer)return;const match=answer.trim().match(/^(\d{1,2})[./ -](\d{4})$/);if(!match||Number(match[1])<1||Number(match[1])>12){showToast('Ay ve yılı 10.2026 biçiminde girin.');return;}calendarMonth=new Date(Number(match[2]),Number(match[1])-1,1,12);renderCalendar();});
    $('#calendar-grid').addEventListener('click',event=>{const button=event.target.closest('[data-date]');if(!button)return;navigateDate(button.dataset.date);closeCalendar();});
    $('#calendar-today').addEventListener('click',()=>{navigateDate(todayKey());closeCalendar();});$('#calendar-close').addEventListener('click',closeCalendar);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#calendar-popover').hidden)closeCalendar({restoreFocus:true});});
    document.addEventListener('click',event=>{if(!$('#calendar-popover').hidden&&!event.target.closest('.date-controls'))closeCalendar();});
    $('#task-rows').addEventListener('change',event=>{if(!event.target.matches('.task-check'))return;const index=Number(event.target.dataset.index);currentRecord.tasks[index].completed=event.target.checked;persist();renderDaily();});
    $('#task-rows').addEventListener('click',event=>{const button=event.target.closest('.daily-task-delete');if(!button)return;currentRecord.tasks.splice(Number(button.dataset.index),1);currentRecord.taskListCustomized=true;persist();renderDaily();showToast('Görev bu günden silindi.');});
    $('[data-focus-add-task]').addEventListener('click',()=>{const form=$('#daily-add-task-form');form.hidden=false;$('#daily-task-name').focus({preventScroll:true});});
    $('#daily-add-task-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#daily-task-name').value.trim(),duration=$('#daily-task-duration').value.trim();if(!name||!duration)return;currentRecord.tasks.push({id:uid(),name,duration,completed:false});currentRecord.taskListCustomized=true;persist();event.target.reset();renderDaily();$('#daily-task-name').focus();showToast('Görev bu güne eklendi.');});
    $('#daily-note').addEventListener('input',event=>{currentRecord.note=event.target.value;$('#note-save-state').textContent='Kaydediliyor…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>{persist();$('#note-save-state').textContent='Kaydedildi';},250);});
    $('#rating-scale').addEventListener('click',event=>{const button=event.target.closest('[data-rating]');if(!button)return;const value=Number(button.dataset.rating);currentRecord.rating=currentRecord.rating===value?null:value;persist();renderRating();});
    $('#add-task-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#new-task-name').value.trim(),duration=$('#new-task-duration').value.trim();if(!name||!duration)return;defaults.push({id:uid(),name,duration});storage.setTasks(defaults);event.target.reset();renderSettings();showToast('Yeni görev eklendi.');});
  }
  init();
})();
