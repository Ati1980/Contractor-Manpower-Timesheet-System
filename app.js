// Contractor Manpower & Working Hours Management System (ระบบบันทึกชั่วโมงทำงานผู้รับเหมา)
// Developed for Manpower Supervision, Safety & Payroll Reporting

(function() {
  'use strict';

  // Constants
  const STORAGE_KEY_TIMESHEETS = 'manpower_timesheets_v1';
  const STORAGE_KEY_EMPLOYEES = 'manpower_employees_v1';
  const STORAGE_KEY_COMPANIES = 'manpower_companies_v1';
  const STORAGE_KEY_SETTINGS = 'manpower_settings_v1';

  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

  // State
  let state = {
    selectedCompanyId: 'c1',
    selectedYear: 2026, // พ.ศ. 2569
    selectedMonth: 1, // 1 - 12
    selectedPeriod: '1', // '1': 1-15, '2': 16-end, 'all': full month
    selectedDepartment: 'all',
    searchKeyword: '',
    activeTab: 'matrix', // 'matrix', 'single', 'report', 'employees'
    
    // Data stores
    companies: [],
    employees: [],
    timesheets: {}, // { empId: { 'YYYY-MM-DD': hours } }
    notes: {},      // { empId: { 'YYYY-MM-DD': note } }
    
    // Single entry form state
    currentSingleEmpId: 'TJ001',
    singleEntryDate: '2026-01-01',
    singleHours: 8,
    singleNote: '',
    
    // UI state
    editingEmpId: null
  };

  // Helper: Format number with commas
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US');
  }

  // Calculate Normal & OT from Total Daily Hours
  function calculateHours(totalHours) {
    const total = parseFloat(totalHours) || 0;
    if (total <= 0) return { normal: 0, ot: 0, total: 0 };
    const normal = Math.min(8, total);
    const ot = Math.max(0, total - 8);
    return { normal, ot, total };
  }

  // Get days in a specific month
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  // Get week number of a date in a year
  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  // Get date list based on selected year, month, period
  function getPeriodDates(year, month, period) {
    const totalDays = getDaysInMonth(year, month);
    let startDay = 1;
    let endDay = totalDays;

    if (period === '1') {
      endDay = 15;
    } else if (period === '2') {
      startDay = 16;
    }

    const dates = [];
    for (let day = startDay; day <= endDay; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const weekNum = getWeekNumber(dateObj);

      dates.push({
        day,
        dateStr,
        dayOfWeek,
        dayNameThai: THAI_DAYS_SHORT[dayOfWeek],
        isWeekend,
        weekNum
      });
    }
    return dates;
  }

  // Toast Notification
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const icon = type === 'success' 
      ? '<svg class="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
      : '<svg class="w-5 h-5 text-amber-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
    
    toast.innerHTML = `<div class="flex items-center bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-750 text-sm font-medium animate-bounce">${icon}<span>${message}</span></div>`;
    toast.classList.remove('hidden', 'opacity-0');
    toast.classList.add('opacity-100');

    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2400);
  }

  // Initialize data from LocalStorage or preloaded master data
  function initData() {
    const defaultData = window.CONTRACTOR_DATA || { companies: [], employees: [], sampleHours: {} };

    // Companies
    const savedCompanies = localStorage.getItem(STORAGE_KEY_COMPANIES);
    state.companies = savedCompanies ? JSON.parse(savedCompanies) : defaultData.companies;

    // Employees
    const savedEmployees = localStorage.getItem(STORAGE_KEY_EMPLOYEES);
    state.employees = savedEmployees ? JSON.parse(savedEmployees) : defaultData.employees;

    // Timesheets
    const savedTimesheets = localStorage.getItem(STORAGE_KEY_TIMESHEETS);
    if (savedTimesheets) {
      state.timesheets = JSON.parse(savedTimesheets);
    } else {
      state.timesheets = {};
      // Populate sample hours if available
      if (defaultData.sampleHours) {
        for (const [empId, dates] of Object.entries(defaultData.sampleHours)) {
          state.timesheets[empId] = { ...dates };
        }
      }
    }

    // Save to ensure initial state in storage
    saveTimesheets();
    saveEmployees();
  }

  function saveTimesheets() {
    try {
      localStorage.setItem(STORAGE_KEY_TIMESHEETS, JSON.stringify(state.timesheets));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  function saveEmployees() {
    try {
      localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(state.employees));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  // Get filtered employees according to department and search keyword
  function getFilteredEmployees() {
    return state.employees.filter(emp => {
      // Department filter
      if (state.selectedDepartment !== 'all' && emp.department !== state.selectedDepartment) {
        return false;
      }
      // Search keyword filter
      if (state.searchKeyword.trim() !== '') {
        const q = state.searchKeyword.toLowerCase().trim();
        const fullName = `${emp.title || ''}${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
        const id = (emp.id || '').toLowerCase();
        const pos = (emp.position || '').toLowerCase();
        const dept = (emp.department || '').toLowerCase();
        if (!fullName.includes(q) && !id.includes(q) && !pos.includes(q) && !dept.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }

  // Render header stats
  function renderDashboardStats() {
    const year = state.selectedYear;
    const month = state.selectedMonth;
    const dates = getPeriodDates(year, month, state.selectedPeriod);
    const dateKeys = dates.map(d => d.dateStr);

    let activeMen = 0;
    let activeWomen = 0;
    let totalNormalHours = 0;
    let totalOtHours = 0;
    let totalHours = 0;

    state.employees.forEach(emp => {
      let empHasWorkedInPeriod = false;
      let empPeriodHours = 0;

      if (state.timesheets[emp.id]) {
        dateKeys.forEach(dateStr => {
          const h = parseFloat(state.timesheets[emp.id][dateStr]) || 0;
          if (h > 0) {
            empHasWorkedInPeriod = true;
            empPeriodHours += h;
            const calc = calculateHours(h);
            totalNormalHours += calc.normal;
            totalOtHours += calc.ot;
            totalHours += calc.total;
          }
        });
      }

      if (empHasWorkedInPeriod) {
        if (emp.gender === 'หญิง') {
          activeWomen++;
        } else {
          activeMen++;
        }
      }
    });

    const activeTotal = activeMen + activeWomen;

    // Update DOM stats
    const statActiveMen = document.getElementById('stat-active-men');
    const statActiveWomen = document.getElementById('stat-active-women');
    const statActiveTotal = document.getElementById('stat-active-total');
    const statTotalNormal = document.getElementById('stat-total-normal');
    const statTotalOt = document.getElementById('stat-total-ot');
    const statTotalHours = document.getElementById('stat-total-hours');

    if (statActiveMen) statActiveMen.textContent = formatNumber(activeMen);
    if (statActiveWomen) statActiveWomen.textContent = formatNumber(activeWomen);
    if (statActiveTotal) statActiveTotal.textContent = formatNumber(activeTotal);
    if (statTotalNormal) statTotalNormal.textContent = formatNumber(totalNormalHours);
    if (statTotalOt) statTotalOt.textContent = formatNumber(totalOtHours);
    if (statTotalHours) statTotalHours.textContent = formatNumber(totalHours);
  }

  // Render Timesheet Matrix Table (Batch Entry)
  function renderMatrixTable() {
    const tableHeaderDates = document.getElementById('matrix-header-dates');
    const tableBody = document.getElementById('matrix-body');
    const tableFooter = document.getElementById('matrix-footer');
    if (!tableHeaderDates || !tableBody) return;

    const dates = getPeriodDates(state.selectedYear, state.selectedMonth, state.selectedPeriod);
    const filteredEmployees = getFilteredEmployees();

    // 1. Build Header Dates
    let headerHtml = '';
    dates.forEach((d, idx) => {
      const weekendClass = d.isWeekend ? 'weekend-header bg-amber-50 text-amber-900 border-amber-200' : 'bg-slate-50 text-slate-750';
      headerHtml += `
        <th class="p-1.5 text-center border-b border-r border-slate-200 text-xs font-semibold ${weekendClass} min-w-[48px]" title="${d.dateStr} (สัปดาห์ที่ ${d.weekNum})">
          <div class="font-prompt text-[13px] font-bold">${d.day}</div>
          <div class="text-[11px] font-medium opacity-80">${d.dayNameThai}</div>
          <div class="text-[9px] text-slate-400 font-mono">W${d.weekNum}</div>
        </th>
      `;
    });
    tableHeaderDates.innerHTML = headerHtml;

    // 2. Build Rows for Employees
    let bodyHtml = '';
    const dayTotals = new Array(dates.length).fill(0);
    let grandNormal = 0;
    let grandOt = 0;
    let grandTotal = 0;

    if (filteredEmployees.length === 0) {
      bodyHtml = `
        <tr>
          <td colspan="${dates.length + 7}" class="py-12 text-center text-slate-400">
            <svg class="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            ไม่พบข้อมูลพนักงานตามเงื่อนไขที่เลือก
          </td>
        </tr>
      `;
    } else {
      filteredEmployees.forEach((emp, rIdx) => {
        const empHours = state.timesheets[emp.id] || {};
        let rowNormal = 0;
        let rowOt = 0;
        let rowTotal = 0;

        let cellsHtml = '';
        dates.forEach((d, cIdx) => {
          const val = empHours[d.dateStr] !== undefined ? empHours[d.dateStr] : 0;
          const calc = calculateHours(val);
          rowNormal += calc.normal;
          rowOt += calc.ot;
          rowTotal += calc.total;
          dayTotals[cIdx] += calc.total;

          let valClass = 'hour-val-0';
          if (val >= 12) valClass = 'hour-val-12';
          else if (val >= 8) valClass = 'hour-val-8';
          else if (val > 0) valClass = 'hour-val-ot';

          const weekendClass = d.isWeekend ? 'weekend-col' : '';

          cellsHtml += `
            <td class="p-0 border-b border-r border-slate-200 text-center ${weekendClass}">
              <input type="number" min="0" max="24" step="0.5" 
                data-emp-id="${emp.id}" 
                data-date="${d.dateStr}"
                data-row="${rIdx}"
                data-col="${cIdx}"
                value="${val}" 
                class="hour-cell ${valClass} focus:bg-blue-100 hover:bg-slate-100 cursor-pointer"
                title="${emp.id} ${emp.firstName}: ${d.dateStr}"
              />
            </td>
          `;
        });

        grandNormal += rowNormal;
        grandOt += rowOt;
        grandTotal += rowTotal;

        const deptBadge = emp.department === 'รักษาความปลอดภัย' ? 'bg-blue-100 text-blue-700'
          : emp.department === 'ธุรการ' ? 'bg-emerald-100 text-emerald-700'
          : emp.department === 'ผลิตไฟฟ้า' ? 'bg-amber-100 text-amber-800'
          : 'bg-purple-100 text-purple-700';

        bodyHtml += `
          <tr class="hover:bg-slate-50 transition-colors bg-white group">
            <td class="sticky-col-1 py-2 px-2 text-center text-xs text-slate-500 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50">
              ${emp.no || (rIdx + 1)}
            </td>
            <td class="sticky-col-2 py-2 px-2 font-mono text-xs font-semibold text-blue-700 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50">
              <button type="button" class="text-left hover:underline focus:outline-none" onclick="window.selectEmployeeForSingleEntry('${emp.id}')" title="คลิกเพื่อกรอกแบบรายคน">
                ${emp.id}
              </button>
            </td>
            <td class="sticky-col-3 py-2 px-3 text-xs text-slate-800 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50 whitespace-nowrap">
              <div class="font-medium flex items-center justify-between">
                <span>${emp.title || ''}${emp.firstName || ''} ${emp.lastName || ''}</span>
                <span class="ml-2 text-[10px] text-slate-400 font-normal">(${emp.gender})</span>
              </div>
              <div class="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>${emp.position || '-'}</span>
                <span class="inline-block px-1.5 py-0.2 rounded text-[10px] ${deptBadge}">${emp.department || '-'}</span>
              </div>
            </td>
            
            ${cellsHtml}
            
            <td class="py-1 px-2 text-right border-b border-r border-slate-200 text-xs font-semibold text-emerald-700 bg-emerald-50/40">
              <span id="row-normal-${emp.id}">${formatNumber(rowNormal)}</span>
            </td>
            <td class="py-1 px-2 text-right border-b border-r border-slate-200 text-xs font-semibold text-amber-700 bg-amber-50/40">
              <span id="row-ot-${emp.id}">${formatNumber(rowOt)}</span>
            </td>
            <td class="py-1 px-2 text-right border-b border-r border-slate-200 text-xs font-bold text-blue-800 bg-blue-50/50">
              <span id="row-total-${emp.id}">${formatNumber(rowTotal)}</span>
            </td>
            <td class="py-1 px-2 text-center border-b border-slate-200 text-xs no-print">
              <div class="flex items-center justify-center gap-1">
                <button type="button" onclick="window.quickFillRow('${emp.id}', 8)" title="เติม 8 ชม. วันธรรมดา" class="p-1 hover:bg-emerald-100 text-emerald-600 rounded text-[10px] font-bold">8h</button>
                <button type="button" onclick="window.quickFillRow('${emp.id}', 12)" title="เติม 12 ชม." class="p-1 hover:bg-blue-100 text-blue-600 rounded text-[10px] font-bold">12h</button>
                <button type="button" onclick="window.quickFillRow('${emp.id}', 0)" title="ล้างเป็น 0" class="p-1 hover:bg-rose-100 text-rose-500 rounded text-[10px] font-bold">0</button>
              </div>
            </td>
          </tr>
        `;
      });
    }

    tableBody.innerHTML = bodyHtml;

    // 3. Build Footer Totals
    let footerCells = '';
    dayTotals.forEach((total, idx) => {
      const isW = dates[idx].isWeekend;
      footerCells += `
        <td class="p-2 text-center text-xs font-bold ${isW ? 'bg-amber-100/70 text-amber-900' : 'bg-slate-100 text-slate-800'} border-r border-slate-300">
          ${formatNumber(total)}
        </td>
      `;
    });

    if (tableFooter) {
      tableFooter.innerHTML = `
        <tr class="bg-slate-100 border-t-2 border-slate-300 font-prompt">
          <td colspan="3" class="py-2.5 px-4 text-right font-bold text-slate-800 text-xs uppercase tracking-wider sticky-col-3 bg-slate-100 border-r border-slate-300">
            รวมชั่วโมงทำงานประจำวัน (Total Daily Hours)
          </td>
          ${footerCells}
          <td class="p-2 text-right text-xs font-bold text-emerald-800 bg-emerald-100/60 border-r border-slate-300">
            ${formatNumber(grandNormal)}
          </td>
          <td class="p-2 text-right text-xs font-bold text-amber-800 bg-amber-100/60 border-r border-slate-300">
            ${formatNumber(grandOt)}
          </td>
          <td class="p-2 text-right text-xs font-black text-blue-900 bg-blue-100/80 border-r border-slate-300">
            ${formatNumber(grandTotal)}
          </td>
          <td class="no-print bg-slate-100"></td>
        </tr>
      `;
    }

    attachMatrixInputEvents();
  }

  // Attach event handlers to matrix inputs with Excel-like navigation
  function attachMatrixInputEvents() {
    const inputs = document.querySelectorAll('.hour-cell');
    inputs.forEach(input => {
      input.addEventListener('change', function() {
        const empId = this.dataset.empId;
        const dateStr = this.dataset.date;
        const val = parseFloat(this.value) || 0;
        this.value = val;

        if (!state.timesheets[empId]) {
          state.timesheets[empId] = {};
        }
        state.timesheets[empId][dateStr] = val;

        // Visual class update
        this.classList.remove('hour-val-0', 'hour-val-8', 'hour-val-12', 'hour-val-ot');
        if (val >= 12) this.classList.add('hour-val-12');
        else if (val >= 8) this.classList.add('hour-val-8');
        else if (val > 0) this.classList.add('hour-val-ot');
        else this.classList.add('hour-val-0');

        saveTimesheets();
        updateRowTotals(empId);
        renderDashboardStats();
      });

      // Arrow navigation
      input.addEventListener('keydown', function(e) {
        const row = parseInt(this.dataset.row, 10);
        const col = parseInt(this.dataset.col, 10);

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const target = document.querySelector(`.hour-cell[data-row="${row - 1}"][data-col="${col}"]`);
          if (target) { target.focus(); target.select(); }
        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          const target = document.querySelector(`.hour-cell[data-row="${row + 1}"][data-col="${col}"]`);
          if (target) { target.focus(); target.select(); }
        } else if (e.key === 'ArrowLeft' && this.selectionStart === 0) {
          const target = document.querySelector(`.hour-cell[data-row="${row}"][data-col="${col - 1}"]`);
          if (target) { target.focus(); target.select(); }
        } else if (e.key === 'ArrowRight' && this.selectionEnd === this.value.length) {
          const target = document.querySelector(`.hour-cell[data-row="${row}"][data-col="${col + 1}"]`);
          if (target) { target.focus(); target.select(); }
        }
      });
    });
  }

  // Quick calculate row totals without re-rendering the whole table
  function updateRowTotals(empId) {
    const dates = getPeriodDates(state.selectedYear, state.selectedMonth, state.selectedPeriod);
    const empHours = state.timesheets[empId] || {};
    let rNormal = 0, rOt = 0, rTotal = 0;

    dates.forEach(d => {
      const h = parseFloat(empHours[d.dateStr]) || 0;
      const calc = calculateHours(h);
      rNormal += calc.normal;
      rOt += calc.ot;
      rTotal += calc.total;
    });

    const normalEl = document.getElementById(`row-normal-${empId}`);
    const otEl = document.getElementById(`row-ot-${empId}`);
    const totalEl = document.getElementById(`row-total-${empId}`);

    if (normalEl) normalEl.textContent = formatNumber(rNormal);
    if (otEl) otEl.textContent = formatNumber(rOt);
    if (totalEl) totalEl.textContent = formatNumber(rTotal);
  }

  // Quick fill employee row
  window.quickFillRow = function(empId, hours) {
    const dates = getPeriodDates(state.selectedYear, state.selectedMonth, state.selectedPeriod);
    if (!state.timesheets[empId]) {
      state.timesheets[empId] = {};
    }

    dates.forEach(d => {
      // If filling 8h on weekdays, don't fill on weekends unless specified
      if (hours === 8 && d.isWeekend) {
        state.timesheets[empId][d.dateStr] = 0;
      } else {
        state.timesheets[empId][d.dateStr] = hours;
      }
    });

    saveTimesheets();
    renderMatrixTable();
    renderDashboardStats();
    showToast(`อัปเดตชั่วโมงของ ${empId} เป็น ${hours} ชม. เรียบร้อย`);
  };

  // Render Single Entry Form Details
  function renderSingleEntryForm() {
    const empSelect = document.getElementById('single-emp-select');
    const empCard = document.getElementById('single-emp-card');
    const dateInput = document.getElementById('single-date');
    const hoursInput = document.getElementById('single-hours');
    const normalDisplay = document.getElementById('single-calc-normal');
    const otDisplay = document.getElementById('single-calc-ot');
    const totalDisplay = document.getElementById('single-calc-total');
    const noteInput = document.getElementById('single-note');

    if (!empSelect) return;

    // Populate employee select options if not already
    empSelect.innerHTML = state.employees.map(emp => `
      <option value="${emp.id}" ${emp.id === state.currentSingleEmpId ? 'selected' : ''}>
        ${emp.id} - ${emp.title}${emp.firstName} ${emp.lastName} (${emp.position} - ${emp.department})
      </option>
    `).join('');

    const currentEmp = state.employees.find(e => e.id === state.currentSingleEmpId) || state.employees[0];
    if (currentEmp) {
      state.currentSingleEmpId = currentEmp.id;

      // Status badge
      const trainingBadge = currentEmp.trainingStatus === 'trained'
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><svg class="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>ผ่านการอบรม จป. แล้ว</span>'
        : currentEmp.trainingStatus === 'train 3 hrs.'
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">อบรม 3 ชม.</span>'
        : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">ยังไม่ได้รับการอบรม</span>';

      const genderAvatar = currentEmp.gender === 'หญิง'
        ? '<div class="w-12 h-12 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-lg">ญ</div>'
        : '<div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">ช</div>';

      if (empCard) {
        empCard.innerHTML = `
          <div class="flex items-start gap-4">
            ${genderAvatar}
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">${currentEmp.id}</span>
                  <h3 class="font-bold text-slate-800 text-base">${currentEmp.title}${currentEmp.firstName} ${currentEmp.lastName}</h3>
                </div>
                ${trainingBadge}
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs text-slate-600">
                <div><span class="text-slate-400">ตำแหน่ง:</span> <strong class="text-slate-750">${currentEmp.position || '-'}</strong></div>
                <div><span class="text-slate-400">กะ/ฝ่าย:</span> <strong class="text-slate-750">${currentEmp.department || '-'}</strong></div>
                <div><span class="text-slate-400">วันเริ่มงาน:</span> <span>${currentEmp.startDate || '-'}</span></div>
                <div><span class="text-slate-400">วันที่อบรม:</span> <span>${currentEmp.trainingDate || '-'}</span></div>
              </div>
            </div>
          </div>
        `;
      }

      // Preload current hours for the date
      if (state.timesheets[currentEmp.id] && state.timesheets[currentEmp.id][state.singleEntryDate] !== undefined) {
        state.singleHours = state.timesheets[currentEmp.id][state.singleEntryDate];
      }
    }

    if (dateInput) dateInput.value = state.singleEntryDate;
    if (hoursInput) hoursInput.value = state.singleHours;
    if (noteInput) noteInput.value = (state.notes[state.currentSingleEmpId] && state.notes[state.currentSingleEmpId][state.singleEntryDate]) || '';

    // Calculation display
    const calc = calculateHours(state.singleHours);
    if (normalDisplay) normalDisplay.textContent = calc.normal + ' ชม.';
    if (otDisplay) otDisplay.textContent = calc.ot + ' ชม.';
    if (totalDisplay) totalDisplay.textContent = calc.total + ' ชม.';

    renderRecentSingleEntries();
  }

  // Render recent entries table in single mode
  function renderRecentSingleEntries() {
    const listContainer = document.getElementById('single-recent-list');
    if (!listContainer) return;

    const currentEmp = state.employees.find(e => e.id === state.currentSingleEmpId);
    if (!currentEmp) return;

    const empHours = state.timesheets[currentEmp.id] || {};
    const dateEntries = Object.keys(empHours).sort().reverse().slice(0, 10);

    if (dateEntries.length === 0) {
      listContainer.innerHTML = '<div class="text-center py-6 text-xs text-slate-400">ยังไม่มีบันทึกเวลาสำหรับพนักงานคนนี้</div>';
      return;
    }

    let rowsHtml = '';
    dateEntries.forEach(dateStr => {
      const h = empHours[dateStr];
      const calc = calculateHours(h);
      const note = (state.notes[currentEmp.id] && state.notes[currentEmp.id][dateStr]) || '-';

      rowsHtml += `
        <tr class="hover:bg-slate-50 text-xs border-b border-slate-100">
          <td class="py-2 px-3 font-mono text-slate-700">${dateStr}</td>
          <td class="py-2 px-3 text-right font-medium text-emerald-700">${calc.normal} ชม.</td>
          <td class="py-2 px-3 text-right font-medium text-amber-700">${calc.ot} ชม.</td>
          <td class="py-2 px-3 text-right font-bold text-blue-700">${calc.total} ชม.</td>
          <td class="py-2 px-3 text-slate-500 truncate max-w-[150px]">${note}</td>
        </tr>
      `;
    });

    listContainer.innerHTML = `
      <table class="w-full text-left">
        <thead>
          <tr class="bg-slate-50 text-slate-500 text-[11px] font-semibold border-b border-slate-200">
            <th class="py-2 px-3">วันที่</th>
            <th class="py-2 px-3 text-right">ชม. ปกติ</th>
            <th class="py-2 px-3 text-right">ชม. OT</th>
            <th class="py-2 px-3 text-right">รวม</th>
            <th class="py-2 px-3">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  // Switch to single entry and select employee
  window.selectEmployeeForSingleEntry = function(empId) {
    state.currentSingleEmpId = empId;
    switchTab('single');
  };

  // Quick preset button click in single form
  window.setSingleHoursPreset = function(hours) {
    state.singleHours = hours;
    const hoursInput = document.getElementById('single-hours');
    if (hoursInput) hoursInput.value = hours;

    const calc = calculateHours(hours);
    const normalDisplay = document.getElementById('single-calc-normal');
    const otDisplay = document.getElementById('single-calc-ot');
    const totalDisplay = document.getElementById('single-calc-total');

    if (normalDisplay) normalDisplay.textContent = calc.normal + ' ชม.';
    if (otDisplay) otDisplay.textContent = calc.ot + ' ชม.';
    if (totalDisplay) totalDisplay.textContent = calc.total + ' ชม.';
  };

  // Save single entry
  window.saveSingleEntry = function(andNext = false) {
    const empId = state.currentSingleEmpId;
    const dateStr = state.singleEntryDate;
    const hours = parseFloat(state.singleHours) || 0;
    const note = state.singleNote.trim();

    if (!state.timesheets[empId]) {
      state.timesheets[empId] = {};
    }
    state.timesheets[empId][dateStr] = hours;

    if (!state.notes[empId]) {
      state.notes[empId] = {};
    }
    if (note) {
      state.notes[empId][dateStr] = note;
    } else {
      delete state.notes[empId][dateStr];
    }

    saveTimesheets();
    renderDashboardStats();
    showToast(`บันทึกเวลาของ ${empId} วันที่ ${dateStr} จำนวน ${hours} ชม. สำเร็จ`);

    if (andNext) {
      // Find current employee index and select next
      const currentIdx = state.employees.findIndex(e => e.id === empId);
      if (currentIdx !== -1 && currentIdx + 1 < state.employees.length) {
        state.currentSingleEmpId = state.employees[currentIdx + 1].id;
      } else {
        state.currentSingleEmpId = state.employees[0].id;
      }
    }

    renderSingleEntryForm();
  };

  // Render Employee List View
  function renderEmployeeList() {
    const tableBody = document.getElementById('employees-table-body');
    const countBadge = document.getElementById('employees-count-badge');
    if (!tableBody) return;

    const filtered = getFilteredEmployees();
    if (countBadge) countBadge.textContent = `${filtered.length} คน`;

    let html = '';
    filtered.forEach((emp, idx) => {
      const trainingBadge = emp.trainingStatus === 'trained'
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">ผ่านการอบรม</span>'
        : emp.trainingStatus === 'train 3 hrs.'
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">อบรม 3 ชม.</span>'
        : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">ยังไม่อบรม</span>';

      html += `
        <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
          <td class="py-2.5 px-3 text-center text-slate-500">${emp.no || idx + 1}</td>
          <td class="py-2.5 px-3 font-mono font-bold text-blue-700">${emp.id}</td>
          <td class="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">${emp.title || ''}${emp.firstName} ${emp.lastName}</td>
          <td class="py-2.5 px-3 text-slate-600">${emp.gender}</td>
          <td class="py-2.5 px-3 text-slate-700">${emp.position}</td>
          <td class="py-2.5 px-3 text-slate-700"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700">${emp.department}</span></td>
          <td class="py-2.5 px-3 text-slate-500 font-mono">${emp.startDate || '-'}</td>
          <td class="py-2.5 px-3">${trainingBadge}</td>
          <td class="py-2.5 px-3 text-slate-500 font-mono">${emp.trainingDate || '-'}</td>
          <td class="py-2.5 px-3 text-center no-print">
            <div class="flex items-center justify-center gap-1.5">
              <button type="button" onclick="window.selectEmployeeForSingleEntry('${emp.id}')" title="กรอกเวลาทำงาน" class="p-1 hover:bg-blue-100 text-blue-600 rounded">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </button>
              <button type="button" onclick="window.openEditEmployeeModal('${emp.id}')" title="แก้ไขข้อมูล" class="p-1 hover:bg-slate-100 text-slate-600 rounded">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button type="button" onclick="window.deleteEmployee('${emp.id}')" title="ลบข้อมูล" class="p-1 hover:bg-rose-100 text-rose-600 rounded">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
  }

  // Render Safety & Executive Summary Report (จป.)
  function renderSummaryReport() {
    const reportTableBody = document.getElementById('report-monthly-body');
    const reportWeeklyBody = document.getElementById('report-weekly-body');
    if (!reportTableBody) return;

    const year = state.selectedYear;
    let grandYearNormal = 0;
    let grandYearOt = 0;
    let grandYearTotal = 0;

    let monthlyHtml = '';

    for (let m = 1; m <= 12; m++) {
      const monthDates = getPeriodDates(year, m, 'all');
      const dateKeys = monthDates.map(d => d.dateStr);

      let activeMenSet = new Set();
      let activeWomenSet = new Set();
      let mNormal = 0;
      let mOt = 0;
      let mTotal = 0;

      state.employees.forEach(emp => {
        if (state.timesheets[emp.id]) {
          dateKeys.forEach(dStr => {
            const h = parseFloat(state.timesheets[emp.id][dStr]) || 0;
            if (h > 0) {
              if (emp.gender === 'หญิง') activeWomenSet.add(emp.id);
              else activeMenSet.add(emp.id);

              const calc = calculateHours(h);
              mNormal += calc.normal;
              mOt += calc.ot;
              mTotal += calc.total;
            }
          });
        }
      });

      grandYearNormal += mNormal;
      grandYearOt += mOt;
      grandYearTotal += mTotal;

      const menCount = activeMenSet.size;
      const womenCount = activeWomenSet.size;
      const totalCount = menCount + womenCount;

      monthlyHtml += `
        <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs ${m === state.selectedMonth ? 'bg-blue-50/50 font-semibold' : ''}">
          <td class="py-2.5 px-3 text-center text-slate-500">${m}</td>
          <td class="py-2.5 px-3 font-medium text-slate-800">${THAI_MONTHS[m - 1]} ${year + 543}</td>
          <td class="py-2.5 px-3 text-right font-medium text-blue-700">${menCount}</td>
          <td class="py-2.5 px-3 text-right font-medium text-pink-700">${womenCount}</td>
          <td class="py-2.5 px-3 text-right font-bold text-slate-800">${totalCount}</td>
          <td class="py-2.5 px-3 text-right font-medium text-emerald-700">${formatNumber(mNormal)}</td>
          <td class="py-2.5 px-3 text-right font-medium text-amber-700">${formatNumber(mOt)}</td>
          <td class="py-2.5 px-3 text-right font-bold text-blue-900 bg-blue-50/30">${formatNumber(mTotal)}</td>
        </tr>
      `;
    }

    // Monthly summary footer
    monthlyHtml += `
      <tr class="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
        <td colspan="5" class="py-2.5 px-3 text-right uppercase">รวมทั้งปี (Year Total ${year + 543})</td>
        <td class="py-2.5 px-3 text-right text-emerald-800">${formatNumber(grandYearNormal)}</td>
        <td class="py-2.5 px-3 text-right text-amber-800">${formatNumber(grandYearOt)}</td>
        <td class="py-2.5 px-3 text-right text-blue-900 bg-blue-100">${formatNumber(grandYearTotal)}</td>
      </tr>
    `;

    reportTableBody.innerHTML = monthlyHtml;

    // Weekly Summary for the selected month
    if (reportWeeklyBody) {
      const monthDates = getPeriodDates(year, state.selectedMonth, 'all');
      const weeksMap = {};

      monthDates.forEach(d => {
        if (!weeksMap[d.weekNum]) {
          weeksMap[d.weekNum] = { week: d.weekNum, dates: [], normal: 0, ot: 0, total: 0 };
        }
        weeksMap[d.weekNum].dates.push(d.dateStr);
      });

      state.employees.forEach(emp => {
        if (state.timesheets[emp.id]) {
          for (const [wNum, wData] of Object.entries(weeksMap)) {
            wData.dates.forEach(dStr => {
              const h = parseFloat(state.timesheets[emp.id][dStr]) || 0;
              if (h > 0) {
                const calc = calculateHours(h);
                wData.normal += calc.normal;
                wData.ot += calc.ot;
                wData.total += calc.total;
              }
            });
          }
        }
      });

      let weeklyHtml = '';
      Object.values(weeksMap).forEach(w => {
        weeklyHtml += `
          <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
            <td class="py-2 px-3 font-bold text-blue-700">สัปดาห์ที่ ${w.week} (Week ${w.week})</td>
            <td class="py-2 px-3 text-slate-500 font-mono text-[11px]">${w.dates[0]} - ${w.dates[w.dates.length - 1]}</td>
            <td class="py-2 px-3 text-right font-medium text-emerald-700">${formatNumber(w.normal)} ชม.</td>
            <td class="py-2 px-3 text-right font-medium text-amber-700">${formatNumber(w.ot)} ชม.</td>
            <td class="py-2 px-3 text-right font-bold text-blue-800">${formatNumber(w.total)} ชม.</td>
          </tr>
        `;
      });

      reportWeeklyBody.innerHTML = weeklyHtml;
    }
  }

  // Switch Active Tab
  function switchTab(tabId) {
    state.activeTab = tabId;
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.remove('bg-transparent', 'text-slate-600', 'hover:bg-slate-100');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('bg-transparent', 'text-slate-600', 'hover:bg-slate-100');
      }
    });

    const panels = ['matrix', 'single', 'report', 'employees'];
    panels.forEach(p => {
      const panelEl = document.getElementById(`tab-panel-${p}`);
      if (panelEl) {
        if (p === tabId) {
          panelEl.classList.remove('hidden');
        } else {
          panelEl.classList.add('hidden');
        }
      }
    });

    // Render corresponding view
    if (tabId === 'matrix') renderMatrixTable();
    else if (tabId === 'single') renderSingleEntryForm();
    else if (tabId === 'report') renderSummaryReport();
    else if (tabId === 'employees') renderEmployeeList();

    renderDashboardStats();
  }

  // Export CSV Format matching Excel specification
  window.exportTimesheetCSV = function() {
    const dates = getPeriodDates(state.selectedYear, state.selectedMonth, state.selectedPeriod);
    const company = state.companies.find(c => c.id === state.selectedCompanyId) || { name: 'บริษัท ที.เจ.เซอร์วิส' };
    
    let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel
    csv += `รายงานชั่วโมงการทำงานผู้รับเหมา,${company.name}\n`;
    csv += `ประจำเดือน : ${THAI_MONTHS[state.selectedMonth - 1]} ${state.selectedYear + 543},งวด : ${state.selectedPeriod === '1' ? '1-15' : state.selectedPeriod === '2' ? '16-สิ้นเดือน' : 'ทั้งเดือน'}\n\n`;

    // Headers
    const dateHeaders = dates.map(d => `${d.dateStr} (${d.dayNameThai})`).join(',');
    csv += `ลำดับ,รหัสพนักงาน,คำนำหน้า,ชื่อ,นามสกุล,ตำแหน่ง,กะ/ฝ่าย,เพศ,${dateHeaders},รวม ชม.ปกติ,รวม ชม.OT,รวม ชม.ทั้งหมด\n`;

    const employees = getFilteredEmployees();
    employees.forEach((emp, idx) => {
      const empHours = state.timesheets[emp.id] || {};
      let rNormal = 0, rOt = 0, rTotal = 0;

      const dailyVals = dates.map(d => {
        const val = parseFloat(empHours[d.dateStr]) || 0;
        const calc = calculateHours(val);
        rNormal += calc.normal;
        rOt += calc.ot;
        rTotal += calc.total;
        return val;
      }).join(',');

      csv += `${idx + 1},"${emp.id}","${emp.title || ''}","${emp.firstName || ''}","${emp.lastName || ''}","${emp.position || ''}","${emp.department || ''}","${emp.gender || ''}",${dailyVals},${rNormal},${rOt},${rTotal}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Timesheet_${company.name.slice(0, 15)}_${state.selectedYear}_${state.selectedMonth}_Period${state.selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
  };

  // Add / Edit Employee Modals
  window.openAddEmployeeModal = function() {
    state.editingEmpId = null;
    document.getElementById('modal-emp-title').textContent = 'เพิ่มพนักงานใหม่';
    document.getElementById('emp-form-id').value = `TJ${String(state.employees.length + 1).padStart(3, '0')}`;
    document.getElementById('emp-form-title').value = 'นาย';
    document.getElementById('emp-form-firstname').value = '';
    document.getElementById('emp-form-lastname').value = '';
    document.getElementById('emp-form-position').value = 'รปภ.';
    document.getElementById('emp-form-department').value = 'รักษาความปลอดภัย';
    document.getElementById('emp-form-gender').value = 'ชาย';
    document.getElementById('emp-form-training').value = 'trained';
    document.getElementById('emp-form-startdate').value = '2026-01-01';
    document.getElementById('emp-form-trainingdate').value = '2026-01-01';

    document.getElementById('emp-modal').classList.remove('hidden');
  };

  window.openEditEmployeeModal = function(empId) {
    state.editingEmpId = empId;
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    document.getElementById('modal-emp-title').textContent = `แก้ไขข้อมูลพนักงาน (${emp.id})`;
    document.getElementById('emp-form-id').value = emp.id;
    document.getElementById('emp-form-title').value = emp.title || 'นาย';
    document.getElementById('emp-form-firstname').value = emp.firstName || '';
    document.getElementById('emp-form-lastname').value = emp.lastName || '';
    document.getElementById('emp-form-position').value = emp.position || '';
    document.getElementById('emp-form-department').value = emp.department || 'รักษาความปลอดภัย';
    document.getElementById('emp-form-gender').value = emp.gender || 'ชาย';
    document.getElementById('emp-form-training').value = emp.trainingStatus || 'trained';
    document.getElementById('emp-form-startdate').value = emp.startDate || '';
    document.getElementById('emp-form-trainingdate').value = emp.trainingDate || '';

    document.getElementById('emp-modal').classList.remove('hidden');
  };

  window.closeEmployeeModal = function() {
    document.getElementById('emp-modal').classList.add('hidden');
  };

  window.saveEmployeeFromModal = function(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('emp-form-id').value.trim();
    const title = document.getElementById('emp-form-title').value.trim();
    const firstName = document.getElementById('emp-form-firstname').value.trim();
    const lastName = document.getElementById('emp-form-lastname').value.trim();
    const position = document.getElementById('emp-form-position').value.trim();
    const department = document.getElementById('emp-form-department').value;
    const gender = document.getElementById('emp-form-gender').value;
    const trainingStatus = document.getElementById('emp-form-training').value;
    const startDate = document.getElementById('emp-form-startdate').value;
    const trainingDate = document.getElementById('emp-form-trainingdate').value;

    if (!id || !firstName) {
      alert('กรุณากรอกรหัสพนักงานและชื่อ');
      return;
    }

    if (state.editingEmpId) {
      const idx = state.employees.findIndex(e => e.id === state.editingEmpId);
      if (idx !== -1) {
        state.employees[idx] = {
          ...state.employees[idx],
          id, title, firstName, lastName, position, department, gender, trainingStatus, startDate, trainingDate
        };
      }
      showToast(`แก้ไขข้อมูลพนักงาน ${id} สำเร็จ`);
    } else {
      state.employees.push({
        no: state.employees.length + 1,
        id, title, firstName, lastName, position, department, gender, trainingStatus, startDate, trainingDate
      });
      showToast(`เพิ่มพนักงานใหม่ ${id} เรียบร้อยแล้ว`);
    }

    saveEmployees();
    closeEmployeeModal();
    renderEmployeeList();
    renderMatrixTable();
  };

  window.deleteEmployee = function(empId) {
    if (!confirm(`คุณต้องการลบพนักงานรหัส ${empId} หรือไม่?`)) return;
    state.employees = state.employees.filter(e => e.id !== empId);
    saveEmployees();
    renderEmployeeList();
    renderMatrixTable();
    showToast(`ลบพนักงาน ${empId} สำเร็จ`);
  };

  // Reset to original dataset
  window.resetSampleData = function() {
    if (!confirm('คุณต้องการรีเซ็ตข้อมูลเป็นชุดข้อมูลเริ่มต้นหรือไม่? (ข้อมูลที่แก้ไขไว้จะถูกแทนที่)')) return;
    localStorage.removeItem(STORAGE_KEY_TIMESHEETS);
    localStorage.removeItem(STORAGE_KEY_EMPLOYEES);
    initData();
    renderMatrixTable();
    renderEmployeeList();
    renderSummaryReport();
    renderSingleEntryForm();
    renderDashboardStats();
    showToast('รีเซ็ตข้อมูลเริ่มต้นสำเร็จ');
  };

  // Bind UI Controls
  function bindEvents() {
    // Company select
    const companySelect = document.getElementById('company-select');
    if (companySelect) {
      companySelect.innerHTML = state.companies.map(c => `
        <option value="${c.id}" ${c.id === state.selectedCompanyId ? 'selected' : ''}>${c.name}</option>
      `).join('');
      companySelect.addEventListener('change', e => {
        state.selectedCompanyId = e.target.value;
        const comp = state.companies.find(c => c.id === state.selectedCompanyId);
        const nameEl = document.getElementById('selected-company-display');
        if (nameEl && comp) nameEl.textContent = comp.name;
        renderMatrixTable();
        renderDashboardStats();
      });
    }

    // Month select
    const monthSelect = document.getElementById('month-select');
    if (monthSelect) {
      monthSelect.innerHTML = THAI_MONTHS.map((m, idx) => `
        <option value="${idx + 1}" ${idx + 1 === state.selectedMonth ? 'selected' : ''}>${m} (เดือน ${idx + 1})</option>
      `).join('');
      monthSelect.addEventListener('change', e => {
        state.selectedMonth = parseInt(e.target.value, 10);
        renderMatrixTable();
        renderDashboardStats();
        renderSummaryReport();
      });
    }

    // Period buttons / select
    const periodButtons = document.querySelectorAll('.period-btn');
    periodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        periodButtons.forEach(b => b.classList.remove('bg-blue-600', 'text-white', 'border-blue-600'));
        periodButtons.forEach(b => b.classList.add('bg-white', 'text-slate-650', 'border-slate-300'));
        btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
        btn.classList.remove('bg-white', 'text-slate-650', 'border-slate-300');
        
        state.selectedPeriod = btn.dataset.period;
        renderMatrixTable();
        renderDashboardStats();
      });
    });

    // Department filter
    const deptFilter = document.getElementById('department-filter');
    if (deptFilter) {
      deptFilter.addEventListener('change', e => {
        state.selectedDepartment = e.target.value;
        renderMatrixTable();
        renderEmployeeList();
      });
    }

    // Search input
    const searchInput = document.getElementById('search-employee');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        state.searchKeyword = e.target.value;
        renderMatrixTable();
        renderEmployeeList();
      });
    }

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Single form controls
    const singleEmpSelect = document.getElementById('single-emp-select');
    if (singleEmpSelect) {
      singleEmpSelect.addEventListener('change', e => {
        state.currentSingleEmpId = e.target.value;
        renderSingleEntryForm();
      });
    }

    const singleDateInput = document.getElementById('single-date');
    if (singleDateInput) {
      singleDateInput.addEventListener('change', e => {
        state.singleEntryDate = e.target.value;
        renderSingleEntryForm();
      });
    }

    const singleHoursInput = document.getElementById('single-hours');
    if (singleHoursInput) {
      singleHoursInput.addEventListener('input', e => {
        state.singleHours = parseFloat(e.target.value) || 0;
        const calc = calculateHours(state.singleHours);
        const normalDisplay = document.getElementById('single-calc-normal');
        const otDisplay = document.getElementById('single-calc-ot');
        const totalDisplay = document.getElementById('single-calc-total');
        if (normalDisplay) normalDisplay.textContent = calc.normal + ' ชม.';
        if (otDisplay) otDisplay.textContent = calc.ot + ' ชม.';
        if (totalDisplay) totalDisplay.textContent = calc.total + ' ชม.';
      });
    }

    const singleNoteInput = document.getElementById('single-note');
    if (singleNoteInput) {
      singleNoteInput.addEventListener('input', e => {
        state.singleNote = e.target.value;
      });
    }

    // Set today's date initially
    const today = new Date();
    const curMonth = today.getMonth() + 1;
    state.selectedMonth = curMonth;
    if (monthSelect) monthSelect.value = curMonth;

    const dateStr = `${state.selectedYear}-${String(curMonth).padStart(2, '0')}-01`;
    state.singleEntryDate = dateStr;
  }

  // App Initialization
  function init() {
    initData();
    bindEvents();
    renderMatrixTable();
    renderDashboardStats();
    renderSingleEntryForm();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
