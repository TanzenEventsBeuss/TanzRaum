import { useState, useEffect, useRef, useCallback } from "react";
import {
  sb, loadAll, mapSlot, mapCourse, mapRoom, mapTeacher, mapLocation,
  dbSaveSlot, dbDeleteSlot, dbUpdateSlotType,
  dbSaveCourse, dbDeleteCourse,
  dbSaveRoom, dbDeleteRoom,
  dbSaveLocation, dbDeleteLocation,
  dbSaveTeacher, dbDeleteTeacher, dbUpdateTeacherActive, dbUpdateTeacherPw,
  dbInsertBookingRequest, dbLoadBookingRequests, dbUpdateBookingStatus,
} from "./supabase.js";

// ── Constants ──────────────────────────────────────────────────────────────
const TODAY      = new Date();
const H_START    = 8, H_END = 23, ROW_H = 20;
const DAYS_S     = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const ADMIN_PW   = "Beuss31608!";
const MONTHS     = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

// ── Helpers ────────────────────────────────────────────────────────────────
const dateStr  = d => d.toISOString().slice(0,10);
const t2m      = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
const m2t      = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const getMonday = d => { const dt=new Date(d),day=dt.getDay(); dt.setDate(dt.getDate()-day+(day===0?-6:1)); return dt; };
const getWeekDates = offset => {
  const base=new Date(TODAY); base.setDate(base.getDate()+offset*7);
  const mon=getMonday(base);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
};
const timeOptions = () => {
  const o=[];
  for(let h=H_START;h<=H_END;h++) for(let m of[0,15,30,45]){ if(h===H_END&&m>0)break; o.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`); }
  return o;
};
const courseApplies = (c,ds) => {
  if(c.recurType==="once") return c.onceDate===ds || c.validFrom===ds;
  const d=new Date(ds+"T12:00"),dow=d.getDay();
  if(c.validFrom&&ds<c.validFrom)return false;
  if(c.validTo&&ds>c.validTo)return false;
  if(c.recurType==="weekly")return c.days.includes(dow);
  if(c.recurType==="monthly"){const vf=new Date(c.validFrom+"T12:00");return vf.getDay()===dow;}
  return false;
};
const genPassword = () => {
  const u="ABCDEFGHJKLMNPQRSTUVWXYZ",l="abcdefghijkmnopqrstuvwxyz",d="23456789",s="!@#$%&",all=u+l+d+s;
  let pw=u[Math.floor(Math.random()*u.length)]+l[Math.floor(Math.random()*l.length)]+d[Math.floor(Math.random()*d.length)]+s[Math.floor(Math.random()*s.length)];
  for(let i=0;i<6;i++)pw+=all[Math.floor(Math.random()*all.length)];
  return pw.split("").sort(()=>Math.random()-.5).join("");
};

// ── CSS (injected once) ───────────────────────────────────────────────────
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0a0f;--surface:#13131a;--surface2:#1c1c26;--border:#1e1e2a;--accent:#ff3c6e;--accent2:#ff8c42;--orange:#ff8c42;--gold:#ffd166;--text:#f0f0f5;--muted:#666677;--green:#06d6a0;--red:#ef233c;--blue:#4ecdc4;--purple:#9b5de5;--r:12px}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh}
.nav{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:52px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:20;gap:12px}
.nav-logo{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:var(--accent)}
.nav-tabs{display:flex;gap:3px;background:var(--surface);padding:3px;border-radius:8px}
.nav-tab{padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;transition:all .2s;background:none;color:var(--muted)}
.nav-tab.active{background:var(--accent);color:#fff;font-weight:500}
.nav-tab:hover:not(.active){color:var(--text)}
.role-wrap{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.role-select{background:var(--surface2);border:1px solid #2a2a38;border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:5px 10px;cursor:pointer}
.inp{background:var(--surface2);border:1px solid #2a2a38;border-radius:8px;padding:11px 14px;color:var(--text);font-size:14px;outline:none;width:100%;transition:border-color .2s;font-family:inherit}
.inp:focus{border-color:var(--accent)}
select.inp{cursor:pointer}
.inp-sm{padding:7px 11px;font-size:13px}
.btn{padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-family:inherit;font-weight:500;transition:all .2s;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.btn-primary{background:var(--accent);color:white}.btn-primary:hover{background:#ff5580}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid #2a2a38}.btn-ghost:hover{color:var(--text);border-color:#555}
.btn-sm{padding:5px 11px;font-size:12px;border-radius:6px}
.btn-xs{padding:3px 8px;font-size:11px;border-radius:5px}
.btn-danger{background:transparent;border:1px solid var(--red);color:var(--red)}.btn-danger:hover{background:var(--red);color:white}
.btn-warn{background:transparent;border:1px solid var(--accent2);color:var(--accent2)}.btn-warn:hover{background:var(--accent2);color:white}
.btn-success{background:transparent;border:1px solid var(--green);color:var(--green)}.btn-success:hover{background:var(--green);color:#0a0a0f}
.btn-gold{background:transparent;border:1px solid var(--gold);color:var(--gold)}.btn-gold:hover{background:var(--gold);color:#0a0a0f}
.btn-purple{background:transparent;border:1px solid var(--purple);color:var(--purple)}.btn-purple:hover{background:var(--purple);color:white}
.wrap{max-width:1200px;margin:0 auto;padding:24px 20px}
.page-hd{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:22px}
.page-title{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px}
.section-title{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:4px}
.section-sub{color:var(--muted);font-size:13px;margin-bottom:18px}
.section-hd{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--muted);margin-bottom:16px}
.form-label{display:block;font-size:11px;color:var(--muted);margin-bottom:4px;letter-spacing:.5px;text-transform:uppercase}
.form-group{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.form-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}
.badge-free{background:rgba(6,214,160,.12);color:var(--green);border:1px solid rgba(6,214,160,.3)}
.badge-booked{background:rgba(78,205,196,.12);color:var(--blue);border:1px solid rgba(78,205,196,.3)}
.badge-blocked{background:rgba(239,35,60,.12);color:var(--red);border:1px solid rgba(239,35,60,.3)}
.badge-pending{background:rgba(255,209,102,.12);color:var(--gold);border:1px solid rgba(255,209,102,.3)}
.badge-course{background:rgba(155,93,229,.12);color:var(--purple);border:1px solid rgba(155,93,229,.3)}
.badge-course-m{background:rgba(255,209,102,.12);color:var(--gold);border:1px solid rgba(255,209,102,.3)}
.badge-window{background:rgba(255,140,66,.12);color:var(--accent2);border:1px solid rgba(255,140,66,.3)}
.filter-strip{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.filter-row{display:flex;gap:5px;flex-wrap:wrap}
.filter-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);align-self:center;margin-right:4px;white-space:nowrap}
.filter-btn{padding:5px 13px;border-radius:20px;border:1px solid var(--border);background:none;color:var(--muted);font-family:inherit;font-size:12px;cursor:pointer;transition:all .2s}
.filter-btn.active{background:var(--surface2);color:var(--text);border-color:#444}
.legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.legend-item{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted)}
.ldot{width:8px;height:8px;border-radius:50%;display:inline-block}
.cal-outer{overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 310px);border:1px solid var(--border);border-radius:var(--r)}
.cal-container{position:relative;min-width:780px}
.calendar-grid{display:grid;grid-template-columns:60px repeat(7,1fr)}
.col-header{background:var(--surface);padding:10px 6px;text-align:center;border-right:1px solid var(--border);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:6}
.col-header.time-col{background:var(--bg)}
.day-name{font-size:.68rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.day-num{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:var(--text);line-height:1;margin-top:2px}
.col-header.today .day-name{color:var(--accent)}.col-header.today .day-num{color:var(--accent)}
.col-header.past-day .day-name,.col-header.past-day .day-num{opacity:.3}
.time-label{background:var(--bg);border-right:1px solid var(--border);border-bottom:1px solid rgba(255,255,255,.03);display:flex;align-items:flex-start;justify-content:flex-end;padding:2px 5px 0;font-size:.6rem;color:var(--muted);height:20px}
.time-label.h-mark{border-bottom:1px solid var(--border)}
.cell{border-right:1px solid var(--border);border-bottom:1px solid rgba(255,255,255,.03);height:20px;cursor:pointer;transition:background .1s}
.cell.h-mark{border-bottom:1px solid var(--border)}
.cell:hover{background:rgba(255,60,110,.05)}
.slot-block{position:absolute;left:2px;right:2px;border-radius:8px;padding:3px 8px;font-size:.68rem;font-weight:500;overflow:hidden;cursor:pointer;z-index:4;border-left:3px solid transparent;transition:filter .15s}
.slot-block:hover{filter:brightness(1.2)}
.slot-block.free{background:rgba(6,214,160,.18);border-left-color:var(--green);color:#4cf7d0}
.slot-block.booked{background:rgba(78,205,196,.18);border-left-color:var(--blue);color:var(--blue)}
.slot-block.blocked{background:rgba(239,35,60,.18);border-left-color:var(--red);color:var(--red)}
.slot-block.pending{background:rgba(255,209,102,.18);border-left-color:var(--gold);color:var(--gold)}
.slot-block.course{background:rgba(155,93,229,.2);border-left-color:var(--purple);color:#c8a8ff}
.sb-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-sub{font-size:.6rem;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slot-block.window{background:rgba(255,140,66,.18);border-left-color:var(--accent2);color:#ffb380;border-style:dashed}
.slot-block.window:hover{filter:brightness(1.2)}
/* Drag selection overlay */
.drag-select{position:absolute;border-radius:8px;background:rgba(6,214,160,.25);border:2px solid var(--green);pointer-events:none;z-index:10;transition:none}
/* Customer calendar hint pulse on window slots */
.kunde-mode .slot-block.window{animation:windowPulse 2s ease-in-out infinite;cursor:crosshair}
@keyframes windowPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,140,66,0)}50%{box-shadow:0 0 0 5px rgba(255,140,66,.2)}}
.kunde-mode .slot-block.free{animation:slotPulse 2.4s ease-in-out infinite;cursor:pointer}
@keyframes slotPulse{0%,100%{box-shadow:0 0 0 0 rgba(6,214,160,0)}50%{box-shadow:0 0 0 4px rgba(6,214,160,.18)}}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.74);backdrop-filter:blur(8px);z-index:200;align-items:center;justify-content:center;padding:16px}
.overlay.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.8rem;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;box-shadow:0 40px 80px rgba(0,0,0,.5);animation:mIn .22s ease}
@keyframes mIn{from{transform:translateY(18px) scale(.97);opacity:0}to{transform:none;opacity:1}}
.modal-title{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.modal-actions{display:flex;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid var(--border)}
.modal-actions .btn{flex:1;justify-content:center}
.type-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.type-btn{padding:10px 8px;border-radius:8px;border:2px solid #2a2a38;background:var(--surface2);color:var(--muted);cursor:pointer;text-align:center;font-family:inherit;font-size:12px;font-weight:500;transition:all .2s}
.type-btn.sel-free.active{border-color:var(--green);color:var(--green);background:rgba(6,214,160,.08)}
.type-btn.sel-booked.active{border-color:var(--blue);color:var(--blue);background:rgba(78,205,196,.08)}
.type-btn.sel-blocked.active{border-color:var(--red);color:var(--red);background:rgba(239,35,60,.08)}
.type-btn.sel-pending.active{border-color:var(--gold);color:var(--gold);background:rgba(255,209,102,.08)}
.type-btn.sel-window.active{border-color:var(--accent2);color:var(--accent2);background:rgba(255,140,66,.08)}
.recur-box{border:1px solid #2a2a38;border-radius:8px;padding:12px;background:var(--surface2);margin-bottom:12px}
.recur-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px}
.day-chips{display:flex;gap:5px;flex-wrap:wrap}
.day-chip{width:34px;height:34px;border-radius:50%;border:1px solid #2a2a38;background:var(--surface);color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:inherit}
.day-chip.active{background:rgba(255,60,110,.12);border-color:var(--accent);color:var(--accent)}
.dur-grid{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.dur-btn{padding:4px 9px;border-radius:6px;border:1px solid #2a2a38;background:var(--surface);color:var(--muted);font-size:11px;cursor:pointer;font-family:inherit;transition:all .15s}
.dur-btn:hover{border-color:var(--gold);color:var(--gold);background:rgba(255,209,102,.08)}
.seg{display:flex;border-radius:8px;overflow:hidden;border:1px solid #2a2a38}
.seg-btn{flex:1;padding:10px;border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;background:var(--surface2);color:var(--muted);transition:all .2s;text-align:center}
.seg-btn.a-pink{background:var(--accent);color:white}.seg-btn.a-gold{background:var(--gold);color:#0a0a0f}.seg-btn.a-blue{background:var(--blue);color:#0a0a0f}
.queue-item{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;transition:border-color .2s}
.queue-item:hover{border-color:#2a2a38}
.queue-item-bookable{border-color:rgba(6,214,160,.2)}.queue-item-bookable:hover{border-color:var(--green);background:rgba(6,214,160,.04)}
.queue-num{font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--muted);min-width:28px}
.queue-info{flex:1;min-width:0}
.queue-title{font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.queue-artist{font-size:12px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.queue-actions{display:flex;gap:5px;flex-shrink:0}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.stat-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 20px}
.stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-weight:600}
.stat-value{font-family:'Bebas Neue',sans-serif;font-size:38px;line-height:1;margin-top:2px}
.stat-sub{font-size:11px;color:var(--muted);margin-top:2px}
.stat-pink .stat-value{color:var(--accent)}.stat-purple .stat-value{color:var(--purple)}.stat-blue .stat-value{color:var(--blue)}.stat-green .stat-value{color:var(--green)}.stat-gold .stat-value{color:var(--gold)}
.room-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;transition:box-shadow .2s}
.room-card:hover{box-shadow:0 4px 28px rgba(0,0,0,.5)}
.room-card-hdr{padding:16px;background:var(--surface2);border-bottom:1px solid var(--border)}
.room-card-name{font-size:16px;font-weight:600}
.room-card-sub{font-size:12px;color:var(--muted);margin-top:2px}
.room-card-body{padding:14px 16px}
.chip-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.chip{padding:2px 8px;border-radius:4px;background:var(--surface2);font-size:11px;color:var(--muted);border:1px solid #2a2a38}
.util-track{margin-top:12px;height:4px;background:var(--border);border-radius:4px;overflow:hidden}
.util-fill{height:100%;border-radius:4px;transition:width .5s ease}
.room-card-foot{padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:6px}
.admin-layout{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 52px)}
.admin-sidebar{background:var(--surface);border-right:1px solid var(--border);padding:16px 0}
.admin-nav-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);padding:10px 16px 3px;font-weight:600}
.admin-nav-item{display:flex;align-items:center;padding:9px 16px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .15s;border-left:3px solid transparent}
.admin-nav-item:hover{color:var(--text);background:var(--surface2)}
.admin-nav-item.active{color:var(--accent);border-left-color:var(--accent);background:rgba(255,60,110,.06)}
.admin-content{padding:24px;overflow-y:auto;max-height:calc(100vh - 52px)}
.data-table{width:100%;border-collapse:collapse}
.data-table th{text-align:left;padding:8px 11px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);font-weight:600}
.data-table td{padding:9px 11px;border-bottom:1px solid rgba(30,30,42,.8);vertical-align:middle;font-size:13px}
.data-table tr:last-child td{border-bottom:none}
.pw-tag{font-size:11px;background:var(--surface2);border:1px solid #2a2a38;padding:1px 7px;border-radius:4px;color:var(--muted);font-family:monospace}
.notice-green{background:rgba(6,214,160,.07);border:1px solid rgba(6,214,160,.2);color:var(--green);border-radius:8px;padding:10px 14px;font-size:13px}
.toast-el{position:fixed;bottom:20px;right:20px;background:var(--surface2);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:8px;padding:10px 16px;font-size:13px;z-index:400;animation:tIn .25s ease;max-width:280px;color:var(--text)}
.toast-el.success{border-left-color:var(--green)}.toast-el.error{border-left-color:var(--red)}
@keyframes tIn{from{transform:translateX(32px);opacity:0}to{transform:none;opacity:1}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.loader-wrap{position:fixed;inset:0;background:var(--bg);z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.loader-logo{font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:6px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.loader-bar-wrap{width:200px;height:3px;background:var(--surface2);border-radius:2px;overflow:hidden}
.loader-bar{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .3s ease}
.loader-msg{font-size:13px;color:var(--muted);letter-spacing:1px}
.admin-login-wrap{display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 52px);padding:20px}
.admin-login-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:36px 32px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:18px}
.admin-login-logo{font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:4px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center}
.admin-login-sub{text-align:center;font-size:13px;color:var(--muted)}
@keyframes shake{0%,100%{transform:none}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.cal-picker-wrap{position:relative;display:inline-block}
.cal-picker{position:absolute;top:calc(100% + 8px);right:0;z-index:50;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;width:256px;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:mIn .18s ease}
.cp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cp-month-label{font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--gold)}
.cp-nav{background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);width:26px;height:26px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
.cp-nav:hover{color:var(--text)}
.cp-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px}
.cp-dow-lbl{text-align:center;font-size:10px;color:var(--muted);font-weight:600;padding:2px 0}
.cp-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.cp-day{text-align:center;font-size:12px;padding:5px 2px;border-radius:6px;cursor:pointer;color:var(--muted);transition:all .15s}
.cp-day:hover:not(.cp-empty):not(.cp-disabled){background:var(--surface2);color:var(--text)}
.cp-day.cp-today{color:var(--gold);font-weight:700}
.cp-day.cp-in-week{background:rgba(255,60,110,.1);color:var(--accent)}
.cp-day.cp-selected-week{background:var(--accent);color:white;font-weight:600}
.cp-day.cp-disabled{opacity:.25;cursor:not-allowed;pointer-events:none}
.cp-day.cp-empty{cursor:default}
.cp-day.cp-has-events::after{content:'';display:block;width:4px;height:4px;border-radius:50%;background:var(--blue);margin:1px auto 0}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--surface2);border-radius:3px}
@media(max-width:700px){
  .stat-grid{grid-template-columns:1fr 1fr}
  .admin-layout{grid-template-columns:1fr}
  .admin-sidebar{display:none}
  .form-row,.form-row3{grid-template-columns:1fr}
  .nav-tabs{display:none}
  .mobile-nav{display:flex!important}
  .cal-outer{max-height:calc(100vh - 260px)}
  .cell{height:28px!important}
  .time-label{height:28px!important;font-size:.65rem}
  .time-label.h-mark{height:28px!important}
  .slot-block{border-radius:6px;padding:3px 6px;font-size:.72rem}
  .sb-sub{display:none}
  .modal{max-width:100%!important;border-radius:16px 16px 0 0!important;position:fixed!important;bottom:0!important;left:0!important;right:0!important;max-height:92vh!important;animation:slideUp .28s ease!important}
  .overlay{align-items:flex-end!important;padding:0!important}
  .btn{padding:11px 16px;font-size:14px}
  .btn-sm{padding:8px 12px;font-size:13px}
  .btn-xs{padding:6px 10px;font-size:12px}
  .filter-row{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
  .filter-btn{flex-shrink:0}
  .slot-block.window{min-height:56px}
  .drag-select{border-width:3px;border-radius:8px}
  .week-label{font-size:13px;min-width:0}
  .page-hd{flex-direction:column;align-items:flex-start;gap:8px}
  .card-grid{grid-template-columns:1fr}
  .admin-content{padding:14px}
  .queue-item{flex-wrap:wrap;gap:8px}
  .queue-actions{width:100%;justify-content:flex-end}
  .view{padding-bottom:74px}
  .cal-outer{touch-action:pan-y}
  .slot-block.window{touch-action:none}
}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:none}}
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);padding:8px 0 max(8px,env(safe-area-inset-bottom));z-index:30}
.mobile-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:10px;color:var(--muted);transition:color .15s}
.mobile-nav-item.active{color:var(--accent)}
.mobile-nav-icon{font-size:20px;line-height:1}
`;

// ── Main App component ─────────────────────────────────────────────────────
export default function App() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [locations, setLocations] = useState([]);
  const [rooms,     setRooms]     = useState([]);
  const [courses,   setCourses]   = useState([]);
  const [slots,     setSlots]     = useState([]);
  const [teachers,  setTeachers]  = useState([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading,       setLoading]       = useState(true);
  const [loadMsg,       setLoadMsg]       = useState("Verbinde mit Datenbank…");
  const [loadPct,       setLoadPct]       = useState(10);
  const [loadError,     setLoadError]     = useState(null);
  const [view,          setView]          = useState("kalender");
  const [adminSection,  setAdminSection]  = useState("courses");
  const [currentRole,   setCurrentRole]   = useState("kunde");
  const [authedRoles,   setAuthedRoles]   = useState(new Set());
  const [authedTeachId, setAuthedTeachId] = useState(null);
  const [pendingRole,   setPendingRole]   = useState(null);
  const [toast,         setToast]         = useState(null);
  const toastTimer = useRef(null);

  // Calendar
  const [weekOffset,     setWeekOffset]     = useState(0);
  const [selRoom,        setSelRoom]        = useState("all");
  const [selLocation,    setSelLocation]    = useState("all");
  const [filterType,     setFilterType]     = useState("all");
  const [calPickerOpen,  setCalPickerOpen]  = useState(false);
  const [cpYear,         setCpYear]         = useState(TODAY.getFullYear());
  const [cpMonth,        setCpMonth]        = useState(TODAY.getMonth());
  const calRef = useRef(null);

  // Modals
  const [slotModal,    setSlotModal]    = useState(null);
  const [courseModal,  setCourseModal]  = useState(null);
  const [roomModal,    setRoomModal]    = useState(null);
  const [teacherModal, setTeacherModal] = useState(null);
  const [bookingModal, setBookingModal] = useState(null);
  const [locationModal,setLocationModal]= useState(null);
  const [staffLogin,   setStaffLogin]   = useState(null);

  // Drag-to-select state (customer booking within a window)
  const dragState = useRef(null); // {colIdx, date, startRow, currentRow, windowSlot}
  const [dragPreview, setDragPreview] = useState(null); // {top,height,left,width} for overlay

  // Login
  const [staffPw, setStaffPw] = useState("");
  const [pwError, setPwError] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  const reload = useCallback(async (table) => {
    const maps = { slots: mapSlot, courses: mapCourse, rooms: mapRoom, teachers: mapTeacher, locations: mapLocation };
    const cols  = { slots:"slot_date", courses:"name", rooms:"name", teachers:"last_name", locations:"name" };
    const { data, error } = await sb.from(table).select("*").order(cols[table]);
    if (error) return;
    if (table === "slots")     setSlots(data.map(mapSlot));
    if (table === "courses")   setCourses(data.map(mapCourse));
    if (table === "rooms")     setRooms(data.map(mapRoom));
    if (table === "teachers")  setTeachers(data.map(mapTeacher));
    if (table === "locations") setLocations(data.map(mapLocation));
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const refreshInterval = useRef(null);

  const refreshAll = useCallback(async (silent=true) => {
    if(!silent) setRefreshing(true);
    try {
      const data = await loadAll();
      setLocations(data.locations);
      setRooms(data.rooms);
      setCourses(data.courses);
      setSlots(data.slots);
      setTeachers(data.teachers);
    } catch(e) {
      if(!silent) showToast("Aktualisierung fehlgeschlagen.", "error");
    } finally {
      if(!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoadPct(20); setLoadMsg("Lade Daten…");
        const data = await loadAll();
        setLocations(data.locations);
        setRooms(data.rooms);
        setCourses(data.courses);
        setSlots(data.slots);
        setTeachers(data.teachers);
        setLoadPct(100); setLoadMsg("Bereit.");
        setTimeout(() => setLoading(false), 400);
        // Realtime subscriptions
        sb.channel("db-changes")
          .on("postgres_changes",{event:"*",schema:"public",table:"slots"},   ()=>reload("slots"))
          .on("postgres_changes",{event:"*",schema:"public",table:"courses"},  ()=>reload("courses"))
          .on("postgres_changes",{event:"*",schema:"public",table:"rooms"},    ()=>reload("rooms"))
          .on("postgres_changes",{event:"*",schema:"public",table:"teachers"}, ()=>reload("teachers"))
          .subscribe();
        // Auto-refresh every 30 seconds as fallback
        refreshInterval.current = setInterval(() => refreshAll(true), 30000);
      } catch(e) {
        setLoadError(e.message);
      }
    })();
    return () => clearInterval(refreshInterval.current);
  }, [reload, refreshAll]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type="") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleRoleChange = (sel) => {
    if (sel === "kunde") { setCurrentRole("kunde"); return; }
    if (authedRoles.has(sel)) { setCurrentRole(sel); return; }
    setPendingRole(sel);
    setStaffPw(""); setPwError(false);
    setStaffLogin(sel);
  };
  const submitLogin = () => {
    let valid = false, teachId = null;
    if (pendingRole === "admin") valid = staffPw === ADMIN_PW;
    else { const t = teachers.find(t => t.active && t.password === staffPw); if(t){valid=true;teachId=t.id;} }
    if (valid) {
      setAuthedRoles(prev => new Set([...prev, pendingRole]));
      setCurrentRole(pendingRole);
      setAuthedTeachId(teachId);
      setStaffLogin(null);
      showToast(pendingRole==="admin"?"Admin-Modus aktiv":"Tanzlehrer-Modus aktiv");
    } else {
      setPwError(true); setStaffPw("");
    }
  };
  const logoutStaff = () => {
    setAuthedRoles(prev => { const n=new Set(prev); n.delete(currentRole); return n; });
    setAuthedTeachId(null);
    setCurrentRole("kunde");
    showToast("Abgemeldet.");
  };

  const isAdmin  = currentRole === "admin";
  const isLehrer = currentRole === "lehrer";
  const isKunde  = currentRole === "kunde";
  const isStaff  = isAdmin || isLehrer;

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const effectiveOffset = isKunde ? Math.max(0, weekOffset) : weekOffset;
  const weekDates = getWeekDates(effectiveOffset);
  const weekStart = dateStr(weekDates[0]);

  // Mobile detection — must be before renderBlocks and CalendarGrid
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 700;
  const visibleDays = isMobile ? 3 : 7;
  const visibleDates = weekDates.slice(0, visibleDays);

  const filteredRoomIds = rooms.filter(r => {
    if (selLocation !== "all" && r.location !== selLocation) return false;
    if (selRoom !== "all" && r.id !== selRoom) return false;
    return true;
  }).map(r => r.id);

  const getEvents = (ds) => {
    const ev = [];
    courses.forEach(c => { if(!filteredRoomIds.includes(c.room))return; if(courseApplies(c,ds))ev.push({...c,_kind:"course",type:"course",date:ds}); });
    slots.forEach(s => { if(!filteredRoomIds.includes(s.room))return; if(s.date===ds)ev.push({...s,_kind:"slot"}); });
    return ev;
  };

  // Draw slot blocks on canvas-style absolutely positioned divs
  const renderBlocks = useCallback(() => {
    const grid = calRef.current;
    if (!grid) return;
    grid.querySelectorAll(".slot-block").forEach(e=>e.remove());
    const headerEl = grid.querySelector(".col-header");
    const headerH = headerEl ? headerEl.offsetHeight : 52;
    const rowH = window.innerWidth <= 700 ? 28 : ROW_H;
    visibleDates.forEach((d, di) => {
      const ds = dateStr(d);
      if (isKunde && ds < weekStart) return;
      const refCell = grid.querySelector(`.cell[data-col="${di}"]`);
      if (!refCell) return;
      const leftPx = refCell.offsetLeft, widthPx = refCell.offsetWidth;
      getEvents(ds).forEach(ev => {
        if (filterType !== "all" && ev.type !== filterType) return;
        const sm=t2m(ev.start)-H_START*60, em=t2m(ev.end)-H_START*60;
        if(em<=0||sm>=(H_END-H_START)*60)return;
        const cs=Math.max(0,sm),ce=Math.min((H_END-H_START)*60,em);
        const top=headerH+(cs/15)*rowH, height=Math.max(rowH,(ce-cs)/15*rowH)-2;
        const b = document.createElement("div");
        b.className = `slot-block ${ev.type}`;
        b.style.cssText = `top:${top}px;height:${height}px;left:${leftPx+2}px;width:${widthPx-4}px;position:absolute;pointer-events:auto`;
        const room = rooms.find(r=>r.id===ev.room);
        const label = ev.name||ev.title||"";
        const sub = ev.type==="window"
          ? `${ev.start}–${ev.end} · ${room?.name||""}`
          : `${ev.start}–${ev.end}${ev.instructor?" · "+ev.instructor:""}${ev.customer?" · "+ev.customer:""}${room&&selRoom==="all"?" · "+room.name:""}`;
        b.innerHTML = `<div class="sb-title">${label}</div><div class="sb-sub">${sub}</div>`;

        if(isKunde && ev.type==="window"){
          const startDrag = (clientY) => {
            const rect = b.getBoundingClientRect();
            const relY = clientY - rect.top;
            const startRow = Math.floor(relY / rowH);
            dragState.current = {di, ds, startRow, currentRow:startRow, windowSlot:ev, leftPx, widthPx, headerH, blockTop:top, blockHeight:height, rowH};
            setDragPreview({top: top + startRow*rowH, height:rowH, left:leftPx+2, width:widthPx-4});
          };
          b.onmousedown = (e) => { e.preventDefault(); startDrag(e.clientY); };
          b.ontouchstart = (e) => { e.preventDefault(); startDrag(e.touches[0].clientY); };
          b.style.cursor = "crosshair";
          b.style.touchAction = "none";
        } else {
          b.onclick = () => {
            if(ev._kind==="course"){if(isAdmin)setCourseModal(ev);return;}
            if(isKunde){if(ev.type==="free"||ev.type==="pending")setBookingModal(ev);return;}
            setSlotModal(ev);
          };
        }
        grid.appendChild(b);
      });
    });
  }, [visibleDates, filteredRoomIds, filterType, isKunde, isAdmin, selRoom, rooms, slots, courses, weekStart]);

  // ── Unified drag/touch handlers for window booking ───────────────────────
  useEffect(() => {
    const getY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

    const onStart = (e) => {
      // Only fires when block sets dragState via onmousedown/ontouchstart
    };

    const onMove = (e) => {
      if(!dragState.current) return;
      if(e.cancelable) e.preventDefault();
      const ds = dragState.current;
      const grid = calRef.current;
      if(!grid) return;
      const rowH = ds.rowH || ROW_H;
      const rect = grid.getBoundingClientRect();
      const relY = getY(e) - rect.top - ds.headerH - ds.blockTop;
      const row = Math.max(0, Math.min(Math.floor(relY / rowH), Math.floor(ds.blockHeight/rowH)-1));
      ds.currentRow = row;
      const minRow = Math.min(ds.startRow, row);
      const maxRow = Math.max(ds.startRow, row);
      const selTop = ds.headerH + ds.blockTop + minRow*rowH;
      const selH   = (maxRow - minRow + 1) * rowH;
      setDragPreview({top:selTop, height:selH, left:ds.leftPx+2, width:ds.widthPx-4});
    };

    const onUp = (e) => {
      if(!dragState.current) return;
      const ds = dragState.current;
      const minRow = Math.min(ds.startRow, ds.currentRow);
      const maxRow = Math.max(ds.startRow, ds.currentRow);
      const durRows = maxRow - minRow + 1;
      setDragPreview(null);
      dragState.current = null;
      if(durRows >= 2) {
        const winStartMin = t2m(ds.windowSlot.start);
        const selStart = m2t(winStartMin + minRow*15);
        const selEnd   = m2t(winStartMin + (maxRow+1)*15);
        setBookingModal({
          ...ds.windowSlot,
          _dragStart: selStart,
          _dragEnd:   selEnd,
          _isWindow:  true,
        });
      }
    };

    window.addEventListener("mousemove",  onMove, {passive:false});
    window.addEventListener("mouseup",    onUp);
    window.addEventListener("touchmove",  onMove, {passive:false});
    window.addEventListener("touchend",   onUp);
    window.addEventListener("touchcancel",onUp);
    return () => {
      window.removeEventListener("mousemove",  onMove);
      window.removeEventListener("mouseup",    onUp);
      window.removeEventListener("touchmove",  onMove);
      window.removeEventListener("touchend",   onUp);
      window.removeEventListener("touchcancel",onUp);
    };
  }, []);

  // ── Inline CSS injection ──────────────────────────────────────────────────
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="loader-wrap">
      <div className="loader-logo">TanzRaum</div>
      <div className="loader-bar-wrap"><div className="loader-bar" style={{width:loadPct+"%"}}></div></div>
      {loadError
        ? <div style={{color:"var(--red)",maxWidth:480,textAlign:"center",fontSize:13}}><strong>Fehler:</strong> {loadError}</div>
        : <div className="loader-msg">{loadMsg}</div>
      }
    </div>
  );

  // ── Render helpers ────────────────────────────────────────────────────────
  const SL = {free:"Frei",booked:"Gebucht",blocked:"Gesperrt",pending:"Anfrage",course:"Kurs",window:"Zeitfenster"};
  const SC = {free:"var(--green)",booked:"var(--blue)",blocked:"var(--red)",pending:"var(--gold)",course:"var(--purple)",window:"var(--orange)"};

  const fmt = d => d.toLocaleDateString("de-DE",{day:"2-digit",month:"long"});
  const weekLabel = isMobile
    ? `${fmt(visibleDates[0])} – ${fmt(visibleDates[visibleDays-1])}`
    : `${fmt(weekDates[0])} – ${fmt(weekDates[6])} ${weekDates[0].getFullYear()}`;

  // ── Calendar grid ─────────────────────────────────────────────────────────
  const CalendarGrid = () => {
    const totalRows = (H_END-H_START)*4;
    const gridRows = [];
    const headers = [<div key="th0" className="col-header time-col"></div>];
    visibleDates.forEach((d,i) => {
      const ds = dateStr(d);
      const isToday = ds === dateStr(TODAY);
      const isPast = isKunde && ds < weekStart;
      headers.push(
        <div key={i} className={`col-header${isToday?" today":""}${isPast?" past-day":""}`}>
          <div className="day-name">{DAYS_S[d.getDay()]}</div>
          <div className="day-num">{d.getDate()}</div>
        </div>
      );
    });
    gridRows.push(...headers);
    for(let row=0;row<totalRows;row++){
      const tm=H_START*60+row*15,h=Math.floor(tm/60),m=tm%60,isH=m===0;
      gridRows.push(<div key={`tl${row}`} className={`time-label${isH?" h-mark":""}`}>{isH?`${String(h).padStart(2,"0")}:00`:""}</div>);
      visibleDates.forEach((_,di)=>{
        const cellTime = m2t(tm);
        const cellDate = dateStr(visibleDates[di]);
        gridRows.push(
          <div key={`c${row}-${di}`}
            className={`cell${isH?" h-mark":""}`}
            data-col={di}
            onClick={()=>{ if(!isKunde) setSlotModal({date:cellDate,start:cellTime,end:m2t(Math.min(tm+60,(H_END)*60)),type:"free"}); }}
          />
        );
      });
    }
    return <>{gridRows}</>;
  };

  // ── Views ─────────────────────────────────────────────────────────────────
  const renderKalender = () => (
    <div className="wrap">
      <div className="page-hd">
        <div>
          <div className="page-title">Wochenübersicht</div>
          <div style={{fontSize:13,color:"var(--muted)"}}>
            {selRoom==="all"?"Alle Säle":rooms.find(r=>r.id===selRoom)?.name||""}
          </div>
        </div>
        {!isKunde && <button className="btn btn-primary" onClick={()=>setSlotModal({type:"free"})}>+ Slot anlegen</button>}
      </div>

      {/* Location + Room filter */}
      <div className="filter-strip">
        <div className="filter-row">
          <span className="filter-label">Standort:</span>
          {[{id:"all",name:"Alle Standorte"},...locations].map(l=>(
            <button key={l.id} className={`filter-btn${selLocation===l.id?" active":""}`} onClick={()=>{setSelLocation(l.id);if(selRoom!=="all"){const r=rooms.find(x=>x.id===selRoom);if(r&&l.id!=="all"&&r.location!==l.id)setSelRoom("all");}}}>{l.name}</button>
          ))}
        </div>
        <div className="filter-row">
          <span className="filter-label">Saal:</span>
          {[{id:"all",name:"Alle Säle"},...rooms.filter(r=>selLocation==="all"||r.location===selLocation)].map(r=>(
            <button key={r.id} className={`filter-btn${selRoom===r.id?" active":""}`} onClick={()=>setSelRoom(r.id)}>{r.name}</button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <select className="inp inp-sm" style={{width:"auto"}} value={filterType} onChange={e=>setFilterType(e.target.value)}>
          <option value="all">Alle Typen</option>
          <option value="course">Tanzkurse</option>
          <option value="window">Zeitfenster</option>
          <option value="free">Frei / buchbar</option>
          <option value="booked">Gebucht</option>
          <option value="blocked">Gesperrt</option>
          <option value="pending">Anfragen</option>
        </select>
        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
          <button className="btn btn-ghost btn-sm" disabled={isKunde&&effectiveOffset<=0} onClick={()=>setWeekOffset(o=>isKunde?Math.max(0,o-1):o-1)}>‹ Zurück</button>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,color:"var(--gold)",minWidth:220,textAlign:"center"}}>{weekLabel}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>setWeekOffset(o=>o+1)}>Weiter ›</button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={()=>setWeekOffset(0)}>Heute</button>
        {isStaff && (
          <div className="cal-picker-wrap">
            <button className="btn btn-ghost btn-sm" onClick={()=>setCalPickerOpen(o=>!o)}>📅 Kalender</button>
            {calPickerOpen && (
              <div className="cal-picker">
                <div className="cp-header">
                  <button className="cp-nav" onClick={()=>{let m=cpMonth-1,y=cpYear;if(m<0){m=11;y--;}setCpMonth(m);setCpYear(y);}}>‹</button>
                  <span className="cp-month-label">{MONTHS[cpMonth]} {cpYear}</span>
                  <button className="cp-nav" onClick={()=>{let m=cpMonth+1,y=cpYear;if(m>11){m=0;y++;}setCpMonth(m);setCpYear(y);}}>›</button>
                </div>
                <div className="cp-dow">{["Mo","Di","Mi","Do","Fr","Sa","So"].map(d=><div key={d} className="cp-dow-lbl">{d}</div>)}</div>
                <div className="cp-days">
                  {(() => {
                    const first=new Date(cpYear,cpMonth,1);
                    let startDow=first.getDay()-1; if(startDow<0)startDow=6;
                    const dim=new Date(cpYear,cpMonth+1,0).getDate();
                    const days=[];
                    for(let i=0;i<startDow;i++) days.push(<div key={`e${i}`} className="cp-day cp-empty"/>);
                    for(let d=1;d<=dim;d++){
                      const ds=`${cpYear}-${String(cpMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                      const inWeek=ds>=weekStart&&ds<=dateStr(weekDates[6]);
                      const isT=ds===dateStr(TODAY);
                      const hasEv=slots.some(s=>s.date===ds)||courses.some(c=>courseApplies(c,ds));
                      days.push(<div key={d} className={`cp-day${isT?" cp-today":""}${inWeek?" cp-in-week":""}${hasEv?" cp-has-events":""}`}
                        onClick={()=>{const t=new Date(cpYear,cpMonth,d);const mon=getMonday(t);const baseMon=getMonday(new Date(TODAY));const diff=Math.round((mon-baseMon)/(7*24*60*60*1000));setWeekOffset(diff);setCalPickerOpen(false);}}
                      >{d}</div>);
                    }
                    return days;
                  })()}
                </div>
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",gap:6}}>
                  <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:"center"}} onClick={()=>{setWeekOffset(0);setCalPickerOpen(false);}}>Heute</button>
                  <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:"center"}} onClick={()=>setCalPickerOpen(false)}>Schließen</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="legend">
        <div className="legend-item"><span className="ldot" style={{background:"var(--purple)"}}></span>Tanzkurs</div>
        <div className="legend-item"><span className="ldot" style={{background:"var(--green)"}}></span>Frei buchbar</div>
        <div className="legend-item"><span className="ldot" style={{background:"var(--accent2)"}}></span>Zeitfenster</div>
        <div className="legend-item"><span className="ldot" style={{background:"var(--blue)"}}></span>Gebucht</div>
        <div className="legend-item"><span className="ldot" style={{background:"var(--red)"}}></span>Gesperrt</div>
        <div className="legend-item"><span className="ldot" style={{background:"var(--gold)"}}></span>Anfrage</div>
        <div style={{marginLeft:"auto",fontSize:11,color:"var(--muted)"}}>
          {isKunde
            ? (isMobile ? "Slots antippen · Im Zeitfenster nach unten ziehen" : "Grüne Slots anklicken · Im Zeitfenster Wunschzeit per Drag auswählen")
            : "Klick auf leere Zelle = Slot anlegen"}
        </div>
      </div>

      <div className="cal-outer">
        <div className={`cal-container${isKunde?" kunde-mode":""}`} style={{position:"relative",minWidth:isMobile?"0":"780px"}}>
          <div className="calendar-grid" ref={r=>{calRef.current=r; if(r) requestAnimationFrame(renderBlocks);}}
            style={{gridTemplateColumns:`${isMobile?"52px":"60px"} repeat(${visibleDays},1fr)`}}>
            <CalendarGrid/>
          </div>
          {dragPreview && (
            <div className="drag-select" style={{
              top:dragPreview.top, height:dragPreview.height,
              left:dragPreview.left, width:dragPreview.width
            }}>
              <div style={{padding:"2px 6px",fontSize:isMobile?12:11,fontWeight:600,color:"var(--green)"}}>
                {Math.round(dragPreview.height/(isMobile?28:ROW_H))*15} min
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderListe = () => {
    let items = slots.filter(s=>{
      if(filterType!=="all"&&s.type!==filterType)return false;
      if(!filteredRoomIds.includes(s.room))return false;
      return true;
    }).map(s=>({...s,_kind:"slot"}));
    if(filterType==="all"||filterType==="course"){
      const base=new Date(TODAY);
      for(let i=0;i<30;i++){
        const d=new Date(base); d.setDate(base.getDate()+i); const ds=dateStr(d);
        courses.filter(c=>filteredRoomIds.includes(c.room)).forEach(c=>{
          if(courseApplies(c,ds))items.push({...c,_kind:"course",type:"course",date:ds,title:c.name,customer:c.instructor});
        });
      }
    }
    items.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
    if(isKunde){const ws=dateStr(getMonday(new Date(TODAY)));items=items.filter(s=>s.type==="free"&&s._kind==="slot"&&s.date>=ws);}
    return (
      <div className="wrap">
        <div className="page-hd">
          <div><div className="page-title">Buchungsliste</div><div style={{fontSize:13,color:"var(--muted)"}}>Slots und Kurse</div></div>
          {!isKunde && <button className="btn btn-primary" onClick={()=>setSlotModal({type:"free"})}>+ Slot anlegen</button>}
        </div>
        {isKunde && <div className="notice-green" style={{marginBottom:16}}>Klicke auf einen <strong>grünen freien Slot</strong> und fülle das Kontaktformular aus.</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          <select className="inp inp-sm" style={{width:"auto"}} value={filterType} onChange={e=>setFilterType(e.target.value)}>
            <option value="all">Alle Typen</option>
            <option value="course">Kurse</option><option value="free">Frei</option>
            <option value="booked">Gebucht</option><option value="blocked">Gesperrt</option><option value="pending">Anfrage</option>
          </select>
          <select className="inp inp-sm" style={{width:"auto"}} value={selLocation} onChange={e=>setSelLocation(e.target.value)}>
            <option value="all">Alle Standorte</option>
            {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="inp inp-sm" style={{width:"auto"}} value={selRoom} onChange={e=>setSelRoom(e.target.value)}>
            <option value="all">Alle Säle</option>
            {rooms.filter(r=>selLocation==="all"||r.location===selLocation).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        {!items.length
          ? <p style={{color:"var(--muted)",fontSize:13}}>{isKunde?"Keine freien Slots verfügbar.":"Keine Einträge."}</p>
          : <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {items.slice(0,60).map((s,i)=>{
              const room=rooms.find(r=>r.id===s.room);
              const loc=room?locations.find(l=>l.id===room.location):null;
              const df=new Date(s.date+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"short"});
              const canEdit=isAdmin||(isLehrer&&s.type!=="blocked");
              const canBook=isKunde&&s.type==="free"&&s._kind==="slot";
              return (
                <div key={s.id||i} className={`queue-item${canBook?" queue-item-bookable":""}`}>
                  <div className="queue-num" style={{color:SC[s.type]}}>{i+1}</div>
                  <div className="queue-info">
                    <div className="queue-title">{s.title||s.name||"?"}</div>
                    <div className="queue-artist">{df} · {s.start}–{s.end} · {room?.name||"?"}
                      {loc?` · ${loc.name}`:""}
                      {s.customer&&!isKunde?` · ${s.customer}`:""}
                    </div>
                    {canBook&&s.price>0&&<div style={{fontSize:12,color:"var(--gold)",marginTop:2,fontWeight:600}}>{s.price.toFixed(2)} €</div>}
                  </div>
                  <span className={`badge badge-${s.type}`}>{SL[s.type]||s.type}</span>
                  <div className="queue-actions">
                    {canEdit&&s._kind==="slot"&&<button className="btn btn-ghost btn-xs" onClick={()=>setSlotModal(s)}>Bearb.</button>}
                    {canEdit&&s._kind==="course"&&isAdmin&&<button className="btn btn-purple btn-xs" onClick={()=>setCourseModal(s)}>Kurs</button>}
                    {canBook&&<button className="btn btn-success btn-sm" onClick={()=>setBookingModal(s)}>Buchen</button>}
                  </div>
                </div>
              );
            })}
          </div>
        }
      </div>
    );
  };

  const renderRaeume = () => (
    <div className="wrap">
      <div className="page-hd">
        <div><div className="page-title">Säle & Räume</div></div>
        {isAdmin&&<button className="btn btn-primary" onClick={()=>setRoomModal({})}>+ Saal hinzufügen</button>}
      </div>
      <div className="card-grid">
        {rooms.map(r=>{
          const total=slots.filter(s=>s.room===r.id).length+courses.filter(c=>c.room===r.id).length;
          const busy=slots.filter(s=>s.room===r.id&&(s.type==="booked"||s.type==="blocked")).length+courses.filter(c=>c.room===r.id).length;
          const util=total?Math.round(busy/total*100):0;
          const loc=locations.find(l=>l.id===r.location);
          return (
            <div key={r.id} className="room-card">
              <div className="room-card-hdr" style={{borderTop:`3px solid ${r.color}`}}>
                <div className="room-card-name">{r.name}</div>
                <div className="room-card-sub">bis {r.cap} Personen · {r.area} m²{loc?` · ${loc.name}`:""}</div>
              </div>
              <div className="room-card-body">
                <div className="chip-row">{r.features.split(",").slice(0,4).map((f,i)=><span key={i} className="chip">{f.trim()}</span>)}</div>
                <div className="util-track"><div className="util-fill" style={{width:util+"%",background:r.color}}/></div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:5}}>{util}% Auslastung · {total} Einträge</div>
              </div>
              {isAdmin&&<div className="room-card-foot"><button className="btn btn-danger btn-xs" onClick={async()=>{if(!confirm("Saal entfernen?"))return;await dbDeleteRoom(r.id);await reload("rooms");showToast("Saal entfernt.");}}>Entfernen</button></div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderUebersicht = () => (
    <div className="wrap">
      <div className="page-hd"><div><div className="page-title">Auslastung & Statistik</div></div></div>
      <div className="stat-grid">
        <div className="stat-card stat-pink"><div className="stat-label">Slots gesamt</div><div className="stat-value">{slots.length}</div></div>
        <div className="stat-card stat-purple"><div className="stat-label">Tanzkurse</div><div className="stat-value">{courses.length}</div></div>
        <div className="stat-card stat-blue"><div className="stat-label">Gebucht</div><div className="stat-value">{slots.filter(s=>s.type==="booked").length}</div></div>
        <div className="stat-card stat-green"><div className="stat-label">Buchbar</div><div className="stat-value">{slots.filter(s=>s.type==="free").length}</div></div>
        <div className="stat-card stat-gold"><div className="stat-label">Anfragen</div><div className="stat-value">{slots.filter(s=>s.type==="pending").length}</div></div>
      </div>
      <div className="section-hd">Bevorstehende Slots</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {slots.filter(s=>s.date>=dateStr(TODAY)).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8).map((s,i)=>{
          const room=rooms.find(r=>r.id===s.room);
          const df=new Date(s.date+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"short"});
          return <div key={s.id} className="queue-item">
            <div className="queue-num" style={{color:SC[s.type]}}>{i+1}</div>
            <div className="queue-info"><div className="queue-title">{s.title}</div><div className="queue-artist">{df} · {s.start}–{s.end} · {room?.name||"?"}</div></div>
            <span className={`badge badge-${s.type}`}>{SL[s.type]}</span>
          </div>;
        })}
      </div>
    </div>
  );

  // ── Admin sections ────────────────────────────────────────────────────────
  const AdminLocationsSection = () => (
    <div>
      <div className="section-title">Standorte</div>
      <div className="section-sub">Standorte anlegen und verwalten. Jedem Saal wird ein Standort zugewiesen.</div>
      <button className="btn btn-primary btn-sm" style={{marginBottom:16}} onClick={()=>setLocationModal({})}>+ Standort anlegen</button>
      <table className="data-table">
        <thead><tr><th>Standortname</th><th>Adresse</th><th>Säle</th><th>Aktionen</th></tr></thead>
        <tbody>
          {locations.length===0&&<tr><td colSpan={4} style={{textAlign:"center",color:"var(--muted)",padding:"1.5rem"}}>Noch keine Standorte angelegt.</td></tr>}
          {locations.map(l=>{
            const roomCount=rooms.filter(r=>r.location===l.id).length;
            return <tr key={l.id}>
              <td><strong>{l.name}</strong></td>
              <td style={{color:"var(--muted)",fontSize:12}}>{l.address||"—"}</td>
              <td>{roomCount} Saal{roomCount!==1?"":""}</td>
              <td style={{display:"flex",gap:5}}>
                <button className="btn btn-ghost btn-xs" onClick={()=>setLocationModal(l)}>Bearb.</button>
                <button className="btn btn-danger btn-xs" onClick={async()=>{
                  if(roomCount>0){showToast("Standort hat noch Säle — bitte zuerst Säle entfernen.","error");return;}
                  if(!confirm("Standort löschen?"))return;
                  await dbDeleteLocation(l.id);await reload("locations");showToast("Standort gelöscht.");
                }}>Löschen</button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );

  const AdminCoursesSection = () => (
    <div>
      <div className="section-title">Tanzkurse</div>
      <div className="section-sub">Wöchentliche oder monatliche Kurse tragen sich automatisch ein.</div>
      <button className="btn btn-primary btn-sm" style={{marginBottom:16}} onClick={()=>setCourseModal({})}>+ Neuen Kurs anlegen</button>
      <table className="data-table">
        <thead><tr><th>Kursname</th><th>Saal</th><th>Zeit</th><th>Wiederholung</th><th>Leiter/in</th><th>Aktionen</th></tr></thead>
        <tbody>
          {courses.length===0&&<tr><td colSpan={6} style={{textAlign:"center",color:"var(--muted)",padding:"1.5rem"}}>Noch keine Kurse.</td></tr>}
          {courses.map(c=>{
            const room=rooms.find(r=>r.id===c.room);
            const dayL=c.days.map(d=>DAYS_S[d]).join(", ");
            return <tr key={c.id}>
              <td><strong>{c.name}</strong>{c.note&&<><br/><span style={{fontSize:11,color:"var(--muted)"}}>{c.note}</span></>}</td>
              <td>{room?.name||"?"}</td>
              <td><span className="pw-tag">{c.start}–{c.end}</span></td>
              <td><span className={`badge ${c.recurType==="weekly"?"badge-course":c.recurType==="monthly"?"badge-course-m":"badge-booked"}`}>
                {c.recurType==="weekly"?`Wöchentlich · ${dayL}`:c.recurType==="monthly"?`Monatlich · ${dayL}`:
                  `Einmalig · ${c.onceDate||c.validFrom?new Date((c.onceDate||c.validFrom)+"T12:00").toLocaleDateString("de-DE",{day:"2-digit",month:"short",year:"numeric"}):""}`}
              </span></td>
              <td>{c.instructor||"—"}</td>
              <td style={{display:"flex",gap:5}}>
                <button className="btn btn-ghost btn-xs" onClick={()=>setCourseModal(c)}>Bearb.</button>
                <button className="btn btn-danger btn-xs" onClick={async()=>{await dbDeleteCourse(c.id);await reload("courses");showToast("Kurs gelöscht.");}}>Löschen</button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );

  const AdminSlotsSection = () => (
    <div>
      <div className="section-title">Einzel-Slots</div>
      <div className="section-sub">Im 15-Minuten-Raster, Mindestdauer 30 min.</div>
      <button className="btn btn-primary btn-sm" style={{marginBottom:16}} onClick={()=>setSlotModal({type:"free"})}>+ Slot anlegen</button>
      <table className="data-table">
        <thead><tr><th>Bezeichnung</th><th>Saal</th><th>Datum</th><th>Zeit</th><th>Status</th><th>Preis</th><th>Aktionen</th></tr></thead>
        <tbody>
          {slots.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"var(--muted)",padding:"1.5rem"}}>Keine Slots.</td></tr>}
          {slots.map(s=>{
            const room=rooms.find(r=>r.id===s.room);
            const df=new Date(s.date+"T12:00").toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
            return <tr key={s.id}>
              <td><strong>{s.title}</strong>{s.customer&&<><br/><span style={{fontSize:11,color:"var(--muted)"}}>{s.customer}</span></>}</td>
              <td>{room?.name||"?"}</td><td>{df}</td>
              <td><span className="pw-tag">{s.start}–{s.end}</span></td>
              <td><span className={`badge badge-${s.type}`}>{SL[s.type]}</span></td>
              <td>{s.price?s.price.toFixed(2)+" €":"—"}</td>
              <td style={{display:"flex",gap:5}}>
                <button className="btn btn-ghost btn-xs" onClick={()=>setSlotModal(s)}>Bearb.</button>
                <button className="btn btn-danger btn-xs" onClick={async()=>{await dbDeleteSlot(s.id);await reload("slots");showToast("Slot gelöscht.");}}>Löschen</button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );

  const AdminRoomsSection = () => (
    <div>
      <div className="section-title">Säle konfigurieren</div>
      <button className="btn btn-primary btn-sm" style={{marginBottom:16}} onClick={()=>setRoomModal({})}>+ Saal hinzufügen</button>
      <table className="data-table">
        <thead><tr><th>Saal</th><th>Standort</th><th>Kapazität</th><th>Fläche</th><th>Ausstattung</th><th>Aktionen</th></tr></thead>
        <tbody>
          {rooms.map(r=>{
            const loc=locations.find(l=>l.id===r.location);
            return <tr key={r.id}>
              <td><strong>{r.name}</strong></td><td>{loc?.name||"—"}</td>
              <td>{r.cap} Pers.</td><td>{r.area} m²</td>
              <td style={{fontSize:11,color:"var(--muted)"}}>{r.features}</td>
              <td><button className="btn btn-danger btn-xs" onClick={async()=>{if(!confirm("Entfernen?"))return;await dbDeleteRoom(r.id);await reload("rooms");showToast("Saal entfernt.");}}>Entfernen</button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );

  const AdminTeachersSection = () => (
    <div>
      <div className="section-title">Tanzlehrer verwalten</div>
      <button className="btn btn-primary btn-sm" style={{marginBottom:16}} onClick={()=>setTeacherModal({})}>+ Tanzlehrer anlegen</button>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {teachers.length===0&&<p style={{color:"var(--muted)",fontSize:13}}>Noch keine Tanzlehrer.</p>}
        {teachers.map(t=>{
          const statusColor=t.active?"var(--green)":"var(--red)";
          return <div key={t.id} className="queue-item" style={{borderColor:t.active?"rgba(6,214,160,.15)":"rgba(239,35,60,.12)"}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:"var(--surface2)",border:`2px solid ${statusColor}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:statusColor,flexShrink:0}}>
              {t.firstName[0]}{t.lastName[0]}
            </div>
            <div className="queue-info">
              <div className="queue-title">{t.firstName} {t.lastName} <span className={`badge ${t.active?"badge-free":"badge-blocked"}`} style={{marginLeft:8,verticalAlign:"middle"}}>{t.active?"Aktiv":"Deaktiviert"}</span></div>
              <div className="queue-artist">{t.email||"—"}{t.phone?` · ${t.phone}`:""}{t.spec?` · ${t.spec}`:""}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:"monospace",color:"var(--muted)"}}>
                PW: <span style={{filter:"blur(4px)",cursor:"pointer",transition:"filter .2s"}}
                  onClick={e=>{e.currentTarget.style.filter=e.currentTarget.style.filter?"":"blur(4px)"}}>{t.password}</span>
                <button className="btn btn-xs btn-ghost" style={{padding:"2px 6px",fontSize:10}} onClick={()=>{navigator.clipboard?.writeText(t.password);showToast("Kopiert!","success");}}>📋</button>
              </div>
              <div style={{display:"flex",gap:5}}>
                <button className="btn btn-ghost btn-xs" onClick={()=>setTeacherModal(t)}>Bearbeiten</button>
                <button className={`btn btn-xs ${t.active?"btn-warn":"btn-success"}`} onClick={async()=>{await dbUpdateTeacherActive(t.id,!t.active);await reload("teachers");showToast(t.active?`${t.firstName} deaktiviert.`:`${t.firstName} aktiviert.`);}}>{t.active?"Deaktivieren":"Aktivieren"}</button>
                <button className="btn btn-gold btn-xs" onClick={async()=>{const pw=genPassword();await dbUpdateTeacherPw(t.id,pw);await reload("teachers");showToast(`Neues PW für ${t.firstName} generiert.`,"success");}}>⚡ Neues PW</button>
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>
  );

  const AdminRequestsSection = () => {
    const [reqs, setReqs] = useState([]);
    useEffect(()=>{ dbLoadBookingRequests().then(setReqs); },[]);
    return (
      <div>
        <div className="section-title">Buchungsanfragen</div>
        {reqs.length===0&&<p style={{color:"var(--muted)",fontSize:13}}>Keine offenen Anfragen.</p>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {reqs.map((r,i)=>{
            const s=r.slots;
            const room=s?rooms.find(x=>x.id===s.room_id):null;
            const df=s?new Date(s.slot_date+"T12:00").toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"}):"-";
            return <div key={r.id} className="queue-item" style={{borderColor:"rgba(255,209,102,.25)"}}>
              <div className="queue-num" style={{color:"var(--gold)"}}>{i+1}</div>
              <div className="queue-info">
                <div className="queue-title">{s?.title||"?"} — {r.first_name} {r.last_name}</div>
                <div className="queue-artist">{df}{s?` · ${s.start_time}–${s.end_time}`:""}{room?` · ${room.name}`:""} · {r.email}{r.phone?` · ${r.phone}`:""}</div>
                {r.message&&<div style={{fontSize:11,color:"var(--muted)",marginTop:2,fontStyle:"italic"}}>"{r.message}"</div>}
              </div>
              <div style={{display:"flex",gap:5}}>
                <button className="btn btn-success btn-xs" onClick={async()=>{await dbUpdateBookingStatus(r.id,"confirmed");await dbUpdateSlotType(r.slot_id,"booked");await reload("slots");setReqs(prev=>prev.filter(x=>x.id!==r.id));showToast("Buchung bestätigt!","success");}}>✓ Best.</button>
                <button className="btn btn-danger btn-xs" onClick={async()=>{await dbUpdateBookingStatus(r.id,"rejected");await dbUpdateSlotType(r.slot_id,"free","");await reload("slots");setReqs(prev=>prev.filter(x=>x.id!==r.id));showToast("Abgelehnt.");}}>✕</button>
              </div>
            </div>;
          })}
        </div>
      </div>
    );
  };

  // ── Inline modal forms ────────────────────────────────────────────────────
  const SlotModalForm = () => {
    const s = slotModal;
    const [title, setTitle]   = useState(s?.title||"");
    const [date,  setDate]    = useState(s?.date||dateStr(TODAY));
    const [start, setStart]   = useState(s?.start||"10:00");
    const [end,   setEnd]     = useState(s?.end||"11:00");
    const [room,  setRoom]    = useState(s?.room||rooms[0]?.id||"");
    const [type,  setType]    = useState(s?.type||"free");
    const [cust,  setCust]    = useState(s?.customer||"");
    const [note,  setNote]    = useState(s?.note||"");
    const [price, setPrice]   = useState(s?.price||"");
    const isEdit = !!s?.id;
    const TOS = timeOptions();
    const save = async()=>{
      if(!title||!date||!start||!end){showToast("Pflichtfelder ausfüllen.","error");return;}
      if(t2m(end)-t2m(start)<30){showToast("Mindestdauer: 30 Minuten.","error");return;}
      const optimisticSlot = {id:isEdit?s.id:"tmp-"+Date.now(),room,title,type,date,start,end,customer:cust,note,price:parseFloat(price)||0};
      if(isEdit) setSlots(prev=>prev.map(x=>x.id===s.id?optimisticSlot:x));
      else setSlots(prev=>[...prev, optimisticSlot]);
      setSlotModal(null);
      showToast(isEdit?"Slot aktualisiert.":"Slot angelegt.","success");
      dbSaveSlot({id:isEdit?s.id:null,room,title,type,date,start,end,customer:cust,note,price:parseFloat(price)||0})
        .then(()=>reload("slots"))
        .catch(()=>{ showToast("Fehler beim Speichern.","error"); reload("slots"); });
    };
    const TYPES=["free","booked","blocked","pending","window"];
    const TLABELS={free:"Frei",booked:"Gebucht",blocked:"Gesperrt",pending:"Anfrage",window:"Zeitfenster"};
    return (
      <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)setSlotModal(null);}}>
        <div className="modal">
          <div className="modal-title">{isEdit?"Slot bearbeiten":"Slot anlegen"}</div>
          <div className="form-group"><div className="form-label">Typ</div>
            <div className="type-grid">{TYPES.map(tp=><button key={tp} className={`type-btn sel-${tp}${type===tp?" active":""}`} onClick={()=>setType(tp)}>{TLABELS[tp]}</button>)}</div>
          </div>
          <div className="form-row">
            <div className="form-group"><div className="form-label">Saal</div><select className="inp" value={room} onChange={e=>setRoom(e.target.value)}>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div className="form-group"><div className="form-label">Bezeichnung</div><input className="inp" value={title} onChange={e=>setTitle(e.target.value)} placeholder="z.B. Saalmiete"/></div>
          </div>
          <div className="form-group"><div className="form-label">Datum</div><input type="date" className="inp" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div className="form-row3">
            <div className="form-group"><div className="form-label">Von</div><select className="inp" value={start} onChange={e=>{setStart(e.target.value);if(t2m(end)<=t2m(e.target.value))setEnd(m2t(Math.min(t2m(e.target.value)+60,H_END*60)));}}>{TOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div className="form-group"><div className="form-label">Bis</div><select className="inp" value={end} onChange={e=>setEnd(e.target.value)}>{TOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div className="form-group"><div className="form-label">Schnellwahl</div>
              <div className="dur-grid">{[30,45,60,90,120].map(m=><button key={m} className="dur-btn" onClick={()=>setEnd(m2t(Math.min(t2m(start)+m,H_END*60)))}>{m<60?m+" min":m/60+" Std"}</button>)}</div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><div className="form-label">Kursleiter / Kunde</div><input className="inp" value={cust} onChange={e=>setCust(e.target.value)}/></div>
            <div className="form-group"><div className="form-label">Preis (EUR)</div><input type="number" className="inp" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></div>
          </div>
          <div className="form-group"><div className="form-label">Notiz</div><input className="inp" value={note} onChange={e=>setNote(e.target.value)}/></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={()=>setSlotModal(null)}>Abbrechen</button>
            {isEdit&&<button className="btn btn-danger" onClick={async()=>{await dbDeleteSlot(s.id);await reload("slots");setSlotModal(null);showToast("Slot gelöscht.");}}>Löschen</button>}
            <button className="btn btn-primary" onClick={save}>✓ Speichern</button>
          </div>
        </div>
      </div>
    );
  };

  const CourseModalForm = () => {
    const c = courseModal;
    const isEdit = !!c?.id;
    const [name,       setName]       = useState(c?.name||"");
    const [room,       setRoom]       = useState(c?.room||rooms[0]?.id||"");
    const [start,      setStart]      = useState(c?.start||"10:00");
    const [end,        setEnd]        = useState(c?.end||"11:30");
    const [recurType,  setRecurType]  = useState(c?.recurType||"weekly");
    const [days,       setDays]       = useState(c?.days||[1]);
    const [validFrom,  setValidFrom]  = useState(c?.validFrom||dateStr(TODAY));
    const [validTo,    setValidTo]    = useState(c?.validTo||"");
    const [onceDate,   setOnceDate]   = useState(c?.onceDate||c?.validFrom||dateStr(TODAY));
    const [instructor, setInstructor] = useState(c?.instructor||"");
    const [note,       setNote]       = useState(c?.note||"");
    const [hasPrice,   setHasPrice]   = useState((c?.price||0)>0);
    const [price,      setPrice]      = useState(c?.price||"");
    const TOS = timeOptions();
    const toggleDay = d => setDays(prev => prev.includes(d)?prev.filter(x=>x!==d):[...prev,d]);
    const save = async()=>{
      if(!name||!start||!end||!room){showToast("Pflichtfelder ausfüllen.","error");return;}
      if(t2m(end)-t2m(start)<30){showToast("Mindestdauer: 30 Minuten.","error");return;}
      if(recurType==="weekly"&&!days.length){showToast("Wochentag wählen.","error");return;}
      if(recurType==="once"&&!onceDate){showToast("Bitte Datum angeben.","error");return;}
      // Optimistic: close modal immediately and show success
      const optimisticCourse = {id:isEdit?c.id:"tmp-"+Date.now(),name,room,start,end,recurType,days,validFrom,validTo,onceDate,instructor,note,price:hasPrice?(parseFloat(price)||0):0};
      if(isEdit) setCourses(prev=>prev.map(x=>x.id===c.id?optimisticCourse:x));
      else setCourses(prev=>[...prev, optimisticCourse]);
      setCourseModal(null);
      showToast(isEdit?"Kurs aktualisiert.":"Kurs angelegt.","success");
      // Save to DB in background, then reload to get real IDs
      dbSaveCourse({id:isEdit?c.id:null,name,room,start,end,recurType,days,validFrom,validTo,onceDate,instructor,note,price:hasPrice?(parseFloat(price)||0):0})
        .then(()=>reload("courses"))
        .catch(()=>{ showToast("Fehler beim Speichern — bitte neu laden.","error"); reload("courses"); });
    };
    return (
      <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)setCourseModal(null);}}>
        <div className="modal">
          <div className="modal-title">{isEdit?"Kurs bearbeiten":"Tanzkurs anlegen"}</div>
          <div className="form-group"><div className="form-label">Kurstitel *</div>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="z.B. Wiener Walzer Anfänger"/>
          </div>
          <div className="form-row">
            <div className="form-group"><div className="form-label">Saal</div>
              <select className="inp" value={room} onChange={e=>setRoom(e.target.value)}>
                {rooms.length===0&&<option value="">— erst Saal anlegen —</option>}
                {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group"><div className="form-label">Kursleiter/in</div>
              <input className="inp" value={instructor} onChange={e=>setInstructor(e.target.value)} placeholder="Name"/>
            </div>
          </div>
          <div className="form-row3">
            <div className="form-group"><div className="form-label">Von</div><select className="inp" value={start} onChange={e=>setStart(e.target.value)}>{TOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div className="form-group"><div className="form-label">Bis</div><select className="inp" value={end} onChange={e=>setEnd(e.target.value)}>{TOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div className="form-group"><div className="form-label">Schnellwahl</div>
              <div className="dur-grid">{[45,60,90,120].map(m=><button key={m} className="dur-btn" onClick={()=>setEnd(m2t(Math.min(t2m(start)+m,H_END*60)))}>{m<60?m+" min":m/60+" Std"}</button>)}</div>
            </div>
          </div>
          <div className="form-group"><div className="form-label">Terminart</div>
            <div className="seg">
              <button className={`seg-btn${recurType==="weekly"?" a-pink":""}`} onClick={()=>setRecurType("weekly")}>Wöchentlich</button>
              <button className={`seg-btn${recurType==="monthly"?" a-gold":""}`} onClick={()=>setRecurType("monthly")}>Monatlich</button>
              <button className={`seg-btn${recurType==="once"?" a-blue":""}`} onClick={()=>setRecurType("once")}>Einmalig</button>
            </div>
          </div>
          {recurType==="once"&&(
            <div className="form-group" style={{marginBottom:12}}>
              <div className="form-label">Datum des Termins *</div>
              <input type="date" className="inp" value={onceDate} onChange={e=>setOnceDate(e.target.value)}/>
            </div>
          )}
          {recurType==="weekly"&&<div className="recur-box" style={{marginBottom:12}}><div className="recur-label">Wochentage</div>
            <div className="day-chips">{[1,2,3,4,5,6,0].map((d,i)=><button key={d} className={`day-chip${days.includes(d)?" active":""}`} onClick={()=>toggleDay(d)}>{["Mo","Di","Mi","Do","Fr","Sa","So"][i]}</button>)}</div>
          </div>}
          {recurType!=="once"&&<div className="form-row">
            <div className="form-group"><div className="form-label">Gültig ab</div><input type="date" className="inp" value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></div>
            <div className="form-group"><div className="form-label">Gültig bis (leer = unbegrenzt)</div><input type="date" className="inp" value={validTo} onChange={e=>setValidTo(e.target.value)}/></div>
          </div>}
          {/* Price toggle */}
          <div style={{border:"1px solid var(--border)",borderRadius:8,padding:12,background:"var(--surface2)",marginBottom:12}}>
            <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:hasPrice?10:0}}>
              <input type="checkbox" checked={hasPrice} onChange={e=>setHasPrice(e.target.checked)} style={{accentColor:"var(--gold)",width:16,height:16}}/>
              <span style={{fontSize:13}}>Kurs hat Kursgebühr</span>
            </label>
            {hasPrice&&<div>
              <div className="form-label" style={{marginTop:4}}>Preis (EUR)</div>
              <input type="number" className="inp" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00" step="0.50" min="0"/>
              <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>0.00 € = kostenlos</div>
            </div>}
          </div>
          <div className="form-group"><div className="form-label">Notiz / Beschreibung</div>
            <input className="inp" value={note} onChange={e=>setNote(e.target.value)} placeholder="z.B. Für Anfänger ohne Vorkenntnisse"/>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={()=>setCourseModal(null)}>Abbrechen</button>
            {isEdit&&<button className="btn btn-danger" onClick={async()=>{await dbDeleteCourse(c.id);await reload("courses");setCourseModal(null);showToast("Kurs gelöscht.");}}>Löschen</button>}
            <button className="btn btn-primary" onClick={save}>✓ Speichern</button>
          </div>
        </div>
      </div>
    );
  };

  const RoomModalForm = () => {
    const [name,     setName]     = useState("");
    const [loc,      setLoc]      = useState(locations[0]?.id||"");
    const [cap,      setCap]      = useState(20);
    const [area,     setArea]     = useState(50);
    const [features, setFeatures] = useState("");
    const [color,    setColor]    = useState("#ff3c6e");
    const save = async()=>{
      if(!name){showToast("Saalname fehlt.","error");return;}
      await dbSaveRoom({name,location:loc,cap,area,features,color});
      await reload("rooms"); setRoomModal(null); showToast("Saal angelegt.","success");
    };
    return (
      <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)setRoomModal(null);}}>
        <div className="modal">
          <div className="modal-title">Saal hinzufügen</div>
          <div className="form-group"><div className="form-label">Saalname</div><input className="inp" value={name} onChange={e=>setName(e.target.value)}/></div>
          <div className="form-group"><div className="form-label">Standort</div><select className="inp" value={loc} onChange={e=>setLoc(e.target.value)}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="form-row">
            <div className="form-group"><div className="form-label">Kapazität</div><input type="number" className="inp" value={cap} onChange={e=>setCap(parseInt(e.target.value)||20)}/></div>
            <div className="form-group"><div className="form-label">Fläche (m²)</div><input type="number" className="inp" value={area} onChange={e=>setArea(parseInt(e.target.value)||50)}/></div>
          </div>
          <div className="form-group"><div className="form-label">Ausstattung</div><input className="inp" value={features} onChange={e=>setFeatures(e.target.value)}/></div>
          <div className="form-group"><div className="form-label">Farbe</div><input type="color" className="inp" value={color} onChange={e=>setColor(e.target.value)} style={{height:40,cursor:"pointer"}}/></div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={()=>setRoomModal(null)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={save}>✓ Anlegen</button>
          </div>
        </div>
      </div>
    );
  };

  const TeacherModalForm = () => {
    const t = teacherModal;
    const isEdit = !!t?.id;
    const [fn, setFn]         = useState(t?.firstName||"");
    const [ln, setLn]         = useState(t?.lastName||"");
    const [email, setEmail]   = useState(t?.email||"");
    const [phone, setPhone]   = useState(t?.phone||"");
    const [spec, setSpec]     = useState(t?.spec||"");
    const [pw, setPw]         = useState(t?.password||"");
    const [active, setActive] = useState(t?.active!==undefined?t.active:true);
    const [err, setErr]       = useState("");
    const save = async()=>{
      if(!fn||!ln){setErr("Vor- und Nachname sind Pflichtfelder.");return;}
      if(!pw||pw.length<6){setErr("Passwort min. 6 Zeichen.");return;}
      const dup=teachers.find(x=>x.password===pw&&x.id!==t?.id);
      if(dup){setErr("Passwort bereits vergeben.");return;}
      setErr("");
      await dbSaveTeacher({id:isEdit?t.id:null,firstName:fn,lastName:ln,email,phone,spec,password:pw,active});
      await reload("teachers"); setTeacherModal(null); showToast(isEdit?"Aktualisiert.":"Tanzlehrer angelegt.","success");
    };
    return (
      <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)setTeacherModal(null);}}>
        <div className="modal" style={{maxWidth:460}}>
          <div className="modal-title">{isEdit?"Tanzlehrer bearbeiten":"Tanzlehrer anlegen"}</div>
          <div className="form-row">
            <div className="form-group"><div className="form-label">Vorname *</div><input className="inp" value={fn} onChange={e=>setFn(e.target.value)}/></div>
            <div className="form-group"><div className="form-label">Nachname *</div><input className="inp" value={ln} onChange={e=>setLn(e.target.value)}/></div>
          </div>
          <div className="form-group"><div className="form-label">E-Mail</div><input type="email" className="inp" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div className="form-group"><div className="form-label">Telefon</div><input type="tel" className="inp" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
          <div className="form-group"><div className="form-label">Spezialisierung</div><input className="inp" value={spec} onChange={e=>setSpec(e.target.value)} placeholder="z.B. Standard, Latein"/></div>
          <div style={{border:"1px solid var(--border)",borderRadius:8,padding:14,background:"var(--surface2)",marginBottom:12}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:13,letterSpacing:2,color:"var(--muted)",marginBottom:10}}>Zugangspasswort</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input className="inp" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Passwort" style={{fontFamily:"monospace"}}/>
              <button className="btn btn-gold btn-sm" style={{whiteSpace:"nowrap",flexShrink:0}} onClick={()=>setPw(genPassword())}>⚡ Gen.</button>
            </div>
          </div>
          <label style={{fontSize:13,display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:8}}>
            <input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} style={{accentColor:"var(--green)",width:16,height:16}}/>
            Zugang aktiv
          </label>
          {err&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>{err}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={()=>setTeacherModal(null)}>Abbrechen</button>
            {isEdit&&<button className="btn btn-danger" onClick={async()=>{if(!confirm("Löschen?"))return;await dbDeleteTeacher(t.id);await reload("teachers");setTeacherModal(null);showToast("Gelöscht.");}}>Löschen</button>}
            <button className="btn btn-primary" onClick={save}>✓ Speichern</button>
          </div>
        </div>
      </div>
    );
  };

  const BookingModalForm = () => {
    const s = bookingModal;
    const isWindow = s?._isWindow;
    const displayStart = isWindow ? s._dragStart : s?.start;
    const displayEnd   = isWindow ? s._dragEnd   : s?.end;
    const room = rooms.find(r=>r.id===s?.room);
    const loc  = room?locations.find(l=>l.id===room.location):null;
    const df   = s?new Date(s.date+"T12:00").toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}):"";
    const [fn, setFn]   = useState("");
    const [ln, setLn]   = useState("");
    const [em, setEm]   = useState("");
    const [ph, setPh]   = useState("");
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const [done, setDone] = useState(false);
    const submit = async()=>{
      if(!fn||!ln){setErr("Vor- und Nachname angeben.");return;}
      if(!em||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){setErr("Gültige E-Mail angeben.");return;}
      setErr("");
      if(isWindow){
        // Save new pending slot from drag selection, then log request
        const saved = await dbSaveSlot({id:null,room:s.room,title:s.title,type:"pending",date:s.date,start:displayStart,end:displayEnd,customer:`${fn} ${ln}`,note:msg||null,price:s.price||0});
        if(!saved){setErr("Fehler beim Speichern.");return;}
        // Reload to get the new slot's id for the booking request
        await reload("slots");
        const newSlot = slots.find(x=>x.date===s.date&&x.start===displayStart&&x.end===displayEnd&&x.room===s.room);
        if(newSlot) await dbInsertBookingRequest(newSlot.id,{firstName:fn,lastName:ln,email:em,phone:ph,message:msg});
      } else {
        const ok=await dbInsertBookingRequest(s.id,{firstName:fn,lastName:ln,email:em,phone:ph,message:msg});
        if(!ok){setErr("Fehler beim Senden.");return;}
        await dbUpdateSlotType(s.id,"pending",`${fn} ${ln}`);
        await reload("slots");
      }
      setDone(true);
      showToast("Buchungsanfrage gesendet!","success");
      setTimeout(()=>setBookingModal(null),3000);
    };
    return (
      <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)setBookingModal(null);}}>
        <div className="modal">
          <div className="modal-title">{isWindow?"Zeitfenster buchen":"Slot anfragen"}</div>
          <div style={{background:"var(--surface2)",border:`1px solid ${isWindow?"rgba(255,140,66,.3)":"rgba(6,214,160,.25)"}`,borderRadius:10,padding:"14px 16px",marginBottom:22}}>
            <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1,color:"var(--muted)",marginBottom:6}}>
              {isWindow?"Ihr gewählter Zeitraum":"Ausgewählter Slot"}
            </div>
            <div style={{fontSize:16,fontWeight:600}}>{s?.title}</div>
            <div style={{fontSize:13,color:"var(--muted)",marginTop:3}}>
              {df} · <strong style={{color:isWindow?"var(--accent2)":"var(--green)"}}>{displayStart}–{displayEnd}</strong> · {room?.name||"?"}{loc?` · ${loc.name}`:""}
            </div>
            {isWindow&&<div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>
              Dauer: {t2m(displayEnd)-t2m(displayStart)} Minuten
            </div>}
            {s?.price>0&&!isWindow&&<div style={{fontSize:13,color:"var(--gold)",marginTop:5,fontWeight:600}}>{s.price.toFixed(2)} €</div>}
          </div>
          {done
            ? <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>✅</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:2,color:"var(--green)"}}>Anfrage gesendet!</div>
                <div style={{fontSize:13,color:"var(--muted)",marginTop:6}}>Wir melden uns in Kürze bei {em}.</div>
              </div>
            : <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:13,letterSpacing:2,color:"var(--muted)",marginBottom:14}}>Ihre Kontaktdaten</div>
                <div className="form-row">
                  <div className="form-group"><div className="form-label">Vorname *</div><input className="inp" value={fn} onChange={e=>setFn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
                  <div className="form-group"><div className="form-label">Nachname *</div><input className="inp" value={ln} onChange={e=>setLn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
                </div>
                <div className="form-group"><div className="form-label">E-Mail *</div><input type="email" className="inp" value={em} onChange={e=>setEm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
                <div className="form-group"><div className="form-label">Telefon (optional)</div><input type="tel" className="inp" value={ph} onChange={e=>setPh(e.target.value)}/></div>
                <div className="form-group"><div className="form-label">Nachricht (optional)</div><textarea className="inp" value={msg} onChange={e=>setMsg(e.target.value)} style={{minHeight:68,resize:"vertical"}}/></div>
                {err&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>{err}</div>}
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={()=>setBookingModal(null)}>Abbrechen</button>
                  <button className="btn btn-primary" style={{flex:2}} onClick={submit}>📩 Anfrage senden</button>
                </div>
              </>
          }
        </div>
      </div>
    );
  };

  const LocationModalForm = () => {
    const l = locationModal;
    const isEdit = !!l?.id;
    const [name,    setName]    = useState(l?.name||"");
    const [address, setAddress] = useState(l?.address||"");
    const [err,     setErr]     = useState("");
    const save = async()=>{
      if(!name.trim()){setErr("Standortname ist ein Pflichtfeld.");return;}
      setErr("");
      const ok = await dbSaveLocation({id:isEdit?l.id:null,name:name.trim(),address:address.trim()});
      if(!ok){setErr("Fehler beim Speichern.");return;}
      await reload("locations");
      setLocationModal(null);
      showToast(isEdit?"Standort aktualisiert.":"Standort angelegt.","success");
    };
    return (
      <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)setLocationModal(null);}}>
        <div className="modal" style={{maxWidth:420}}>
          <div className="modal-title">{isEdit?"Standort bearbeiten":"Standort anlegen"}</div>
          <div className="form-group">
            <div className="form-label">Standortname *</div>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="z.B. Hauptstandort Mitte" autoFocus onKeyDown={e=>e.key==="Enter"&&save()}/>
          </div>
          <div className="form-group">
            <div className="form-label">Adresse (optional)</div>
            <input className="inp" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Straße, PLZ Ort" onKeyDown={e=>e.key==="Enter"&&save()}/>
          </div>
          {err&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>{err}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={()=>setLocationModal(null)}>Abbrechen</button>
            {isEdit&&<button className="btn btn-danger" onClick={async()=>{
              const rc=rooms.filter(r=>r.location===l.id).length;
              if(rc>0){setErr(`Standort hat noch ${rc} Saal/Säle — erst Säle entfernen.`);return;}
              if(!confirm("Standort löschen?"))return;
              await dbDeleteLocation(l.id);await reload("locations");setLocationModal(null);showToast("Standort gelöscht.");
            }}>Löschen</button>}
            <button className="btn btn-primary" onClick={save}>✓ Speichern</button>
          </div>
        </div>
      </div>
    );
  };

  const StaffLoginModal = () => (
    <div className="overlay open">
      <div className="modal" style={{maxWidth:380}}>
        <div className="modal-title">Anmelden</div>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div className="admin-login-logo">{pendingRole==="admin"?"Verwaltung":"Tanzlehrer/in"}</div>
          <div className="admin-login-sub">Bitte Passwort eingeben</div>
        </div>
        <div className="form-group">
          <div className="form-label">Passwort</div>
          <input type="password" className="inp" value={staffPw} onChange={e=>{setStaffPw(e.target.value);setPwError(false);}} onKeyDown={e=>e.key==="Enter"&&submitLogin()} autoFocus/>
        </div>
        {pwError&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>Falsches Passwort.</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={()=>{setStaffLogin(null);setPendingRole(null);}}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:2}} onClick={submitLogin}>Anmelden</button>
        </div>
      </div>
    </div>
  );

  // ── Admin view ─────────────────────────────────────────────────────────────
  const renderAdmin = () => {
    if (!isAdmin) return (
      <div className="admin-login-wrap">
        <div className="admin-login-panel">
          <div className="admin-login-logo">TanzRaum</div>
          <div className="admin-login-sub">Admin-Bereich · Zugang beschränkt</div>
          <button className="btn btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={()=>handleRoleChange("admin")}>Als Admin anmelden</button>
        </div>
      </div>
    );
    const sections = {locations:<AdminLocationsSection/>,courses:<AdminCoursesSection/>,slots:<AdminSlotsSection/>,rooms:<AdminRoomsSection/>,teachers:<AdminTeachersSection/>,requests:<AdminRequestsSection/>};
    const navItems=[{id:"locations",label:"📍 Standorte"},{id:"courses",label:"🎵 Tanzkurse"},{id:"slots",label:"📅 Einzel-Slots"},{id:"rooms",label:"🏛 Säle"},{id:"teachers",label:"👤 Tanzlehrer"},{id:"requests",label:"⏳ Anfragen"}];
    return (
      <div className="admin-layout">
        <div className="admin-sidebar">
          <div className="admin-nav-label">Stammdaten</div>
          {navItems.slice(0,1).map(n=><div key={n.id} className={`admin-nav-item${adminSection===n.id?" active":""}`} onClick={()=>setAdminSection(n.id)}>{n.label}</div>)}
          <div className="admin-nav-label">Planung</div>
          {navItems.slice(1,3).map(n=><div key={n.id} className={`admin-nav-item${adminSection===n.id?" active":""}`} onClick={()=>setAdminSection(n.id)}>{n.label}</div>)}
          <div className="admin-nav-label">Infrastruktur</div>
          {navItems.slice(3,4).map(n=><div key={n.id} className={`admin-nav-item${adminSection===n.id?" active":""}`} onClick={()=>setAdminSection(n.id)}>{n.label}</div>)}
          <div className="admin-nav-label">Personal</div>
          {navItems.slice(4,5).map(n=><div key={n.id} className={`admin-nav-item${adminSection===n.id?" active":""}`} onClick={()=>setAdminSection(n.id)}>{n.label}</div>)}
          <div className="admin-nav-label">Buchungen</div>
          {navItems.slice(5).map(n=><div key={n.id} className={`admin-nav-item${adminSection===n.id?" active":""}`} onClick={()=>setAdminSection(n.id)}>{n.label}</div>)}
          <div style={{padding:"16px 12px",marginTop:24,borderTop:"1px solid var(--border)"}}>
            <button className="btn btn-danger btn-sm" style={{width:"100%",justifyContent:"center"}} onClick={logoutStaff}>🔓 Abmelden</button>
          </div>
        </div>
        <div className="admin-content">{sections[adminSection]}</div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Nav */}
      <div className="nav">
        <div className="nav-logo">TanzRaum</div>
        <div className="nav-tabs">
          {[{id:"kalender",label:"Kalender"},{id:"liste",label:"Buchungen",staffOnly:true},{id:"raeume",label:"Säle"},{id:"uebersicht",label:"Übersicht",staffOnly:true},{id:"admin",label:"Admin",adminOnly:true}].map(tab=>{
            if(tab.staffOnly&&!isStaff)return null;
            if(tab.adminOnly&&!isAdmin)return null;
            return <button key={tab.id} className={`nav-tab${view===tab.id?" active":""}`} onClick={()=>setView(tab.id)}>{tab.label}</button>;
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
          {isStaff && (
            <button
              title="Daten aktualisieren"
              onClick={()=>refreshAll(false)}
              style={{background:"none",border:"1px solid var(--border)",borderRadius:6,color:refreshing?"var(--green)":"var(--muted)",cursor:"pointer",padding:"4px 8px",fontSize:14,lineHeight:1,transition:"color .2s",animation:refreshing?"spin .8s linear infinite":"none"}}
            >↻</button>
          )}
          <div className="role-wrap">
            Ansicht:
            <select className="role-select" value={currentRole} onChange={e=>handleRoleChange(e.target.value)}>
              <option value="kunde">🧑 Kunde / Mitglied</option>
              <option value="lehrer">🎵 Tanzlehrer/in</option>
              <option value="admin">🔑 Verwaltung (Admin)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Views */}
      {view==="kalender"   && renderKalender()}
      {view==="liste"      && renderListe()}
      {view==="raeume"     && renderRaeume()}
      {view==="uebersicht" && isStaff && renderUebersicht()}
      {view==="admin"      && renderAdmin()}

      {/* Mobile bottom nav */}
      <div className="mobile-nav" style={{display:"none"}}>
        {[
          {id:"kalender", icon:"📅", label:"Kalender"},
          {id:"raeume",   icon:"🏛",  label:"Säle"},
          ...(isStaff ? [{id:"liste",     icon:"📋", label:"Buchungen"}] : []),
          ...(isStaff ? [{id:"uebersicht",icon:"📊", label:"Übersicht"}] : []),
          ...(isAdmin ? [{id:"admin",     icon:"⚙️", label:"Admin"}]     : []),
        ].map(tab=>(
          <button key={tab.id} className={`mobile-nav-item${view===tab.id?" active":""}`} onClick={()=>setView(tab.id)}>
            <span className="mobile-nav-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Modals */}
      {slotModal    && <SlotModalForm/>}
      {courseModal  && <CourseModalForm/>}
      {roomModal    && <RoomModalForm/>}
      {teacherModal && <TeacherModalForm/>}
      {bookingModal && <BookingModalForm/>}
      {locationModal&& <LocationModalForm/>}
      {staffLogin   && <StaffLoginModal/>}

      {/* Toast */}
      {toast && <div className={`toast-el${toast.type?" "+toast.type:""}`}>{toast.msg}</div>}
    </>
  );
}
