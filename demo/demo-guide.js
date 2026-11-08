/*!
 * Inspired Closets Demo - "Report Guide" page, rendered in JavaScript
 * Serve : https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@demo-guide-v1.0.0/demo/demo-guide.js
 * The guide explains the report; it never reports figures. The only live value is window.__demoGuide.updated
 * (the last data update, passed from the Power BI measure). License: MIT
 */
(function () {
  'use strict';
  if (window.DEMOGUIDE && window.DEMOGUIDE.__installed) { window.DEMOGUIDE.render(); return; }

  var T = { ink: '#282829', sec: '#4A4340', soft: '#71645C', faint: '#8F847C', line: '#E4DCD6', ground: '#F3EEEA',
    card: '#FFFFFF', head: '#FBF8F5', brand: '#821F2D', brandTk: '#F5E9EA', sold: '#1B7A4E', lost: '#E07B39', prop: '#3B6FB6', dead: '#666666', navy: '#2F4858' };

  var G = {
    title: 'Report Guide',
    eyebrow: 'Inspired Closets · Demo',
    intro: 'This report shows how an Inspired Closets franchise is selling, using made-up demo data: where customers come from, how leads turn into appointments and sales, and how each designer is doing. It opens on the <b>Home</b> page. Every sales page opens on 2026 and later, with sales counted by the date the project was sold.',
    sections: [
      { id: 'pages', title: 'The pages', body: [
        { defs: [
          ['Home', 'The starting point. Click a tile to open a report.'],
          ['KPI Overview', 'How this year, this month and this week compare with the same days of the last period, plus the same tiles as your Salesforce Community dashboard. Use it for a quick health check.'],
          ['Lead Source', 'Sold revenue by where the customer came from, by stage and by week, with every project listed underneath. Use it to see which sources bring in sales.'],
          ['Pipeline', 'Sold projects week by week, closing % by designer, and the project list. Use it to follow sales and each designer’s results.'],
          ['Opportunities', 'New leads, their status, where they came from and how they trend month by month. The <b>Details</b> tab adds a week by week table, a map and every lead.'],
          ['Appointments', 'Design and installation appointments, their project stage and their source. The <b>Details</b> tab adds appointments by week, a map and every appointment.'],
          ['Opportunity Journey', 'Where leads go after they come in: how many booked an appointment, reached the studio and sold, the Lead journey picture from source to sale, and every lead with its path.'],
          ['Local Leads - ROAS', 'Projects from local paid-ad leads by location: total pipeline, working and closed dollars, and every project with its source. Use it to see what local advertising brings in.'],
          ['Local Leads - Lead Quality', 'Leads from local ads by platform, location and status: total leads, scheduled, junk % and how many moved to a next step. Use it to judge lead quality before spending more.'],
          ['Guide', 'This page.']
        ] }
      ] },
      { id: 'moving', title: 'Moving around and choosing what you see', body: [
        { list: [
          'The bar at the bottom of every page takes you to any report. The page you are on is shown in red.',
          'Lead Source and Pipeline count sales by sold date. Click <b>Filter by Created Date</b> to see the same page by the date the project was created, and <b>Filter by Sold Date</b> to go back.',
          'Opportunities and Appointments each have two tabs at the top: <b>Overview</b> and <b>Details</b>.',
          'Click <b>Filters</b> at the top right, or the summary line next to it, to open the filter window. Each page has its own lists, for example <b>Designer</b>, <b>Lead Source</b> and <b>Form Type</b>. Every pick applies straight away.',
          '<b>Clear all filters</b> resets every list in the window. <b>Done</b>, the <b>X</b> or a click outside the window closes it, and your choices stay.',
          'The two lines at the top always show what is selected: the dates on the left, and the designers, sources and other lists next to <b>Filters</b>.',
          'Every page with filters has a <b>Dates</b> button at the top. It always shows the dates in use; click it to open the date window with the <b>Year</b> and <b>Month</b> lists and a two-month calendar. Pick a preset such as <b>Last month</b>, click a start day and then an end day, or type the dates. <b>Clear</b> goes back to all dates. Every pick applies straight away.',
          'On Opportunities and Appointments, your choices carry over between the <b>Overview</b> and <b>Details</b> tabs.',
          'Year starts on 2026 and later. Open <b>Dates</b> and tick earlier years in the <b>Year</b> list to look further back.'
        ] }
      ] },
      { id: 'reading', title: 'Reading a page', body: [
        { list: [
          'The big numbers at the top are the headline for everything selected. The small line under some of them adds context, such as how much was lost or how many jobs were sold.',
          'Click a bar, a slice or a point on a line to filter the rest of the page to it. Click it again to clear it.',
          'On Opportunity Journey, click a source, a step or a band in the Lead journey picture and the whole page follows; click it again, or click a blank part of the picture, to clear it. Click a row in the table to see that lead’s path lit up in the picture.',
          'Hover over any bar, slice or point to see the exact amount.',
          'On the Opportunities and Appointments <b>Overview</b> tabs, right-click a lead source, lead status or project stage and choose <b>Drill through</b> to open the <b>Details</b> tab for just that item.',
          'Click a column heading to sort a table. Long text, such as project notes, wraps onto extra lines.',
          'Maps open on the Denver area, where the demo’s made-up customers live. Use the <b>+</b> and <b>−</b> buttons to zoom.'
        ] }
      ] },
      { id: 'meaning', title: 'What the numbers mean', body: [
        { h: 'Sales: Lead Source and Pipeline' },
        { defs: [
          ['Total bid amount', 'The total value of the projects selected, sold or lost.'],
          ['Sold revenue, Sold', 'The value of projects Salesforce marks as sold: the stage is Ready to Order, Ready to Install, Complete or Incomplete.'],
          ['Projects', 'The number of projects selected. <b>Count Sold</b> is the number of sold projects.'],
          ['Avg project value', 'The average value of projects worth more than $1,000. Smaller add-on orders are left out so they do not pull the average down.'],
          ['Avg sold job', 'Shown under Avg project value: sold revenue divided by the number of sold jobs.'],
          ['Closing %', 'Projects sold in the dates you chose, divided by projects created in the same dates. Projects marked Dead Lead are not counted as created.']
        ] },
        { h: 'Opportunities' },
        { defs: [
          ['Total Opportunities', 'New leads created in the dates you chose.'],
          ['Converted', 'Leads whose status is Moved to Studio.'],
          ['Brochure, Consultation', 'Leads that came in through the brochure download form or the consultation request form.'],
          ['Conversion Rate', 'Converted divided by Total Opportunities.']
        ] },
        { h: 'Appointments' },
        { defs: [
          ['Total Activities', 'Appointments and calendar entries in the dates you chose. Designer availability blocks are left out.'],
          ['Sold Projects, Proposed, Lost Projects', 'Appointments whose project is now sold, proposed or lost. These count appointments, so a project with several appointments counts more than once.'],
          ['Success Rate', 'Sold Projects divided by Total Activities.']
        ] },
        { h: 'Opportunity Journey' },
        { defs: [
          ['Leads', 'Leads created in the dates you chose. Duplicate and Junk leads are left out.'],
          ['Booked an appointment, Reached the studio, Sold', 'How many of those leads got that far, the share of all leads, and the typical number of days from the lead coming in. Half of the leads are faster than that and half slower.'],
          ['Sold value', 'The sold value of those leads’ projects, and the sold value per lead.'],
          ['Lead journey', 'Every lead flows left to right: its source, its first contact, the studio and where it is now. Each band is a group of leads and wider means more leads. Hover a band or a step for the numbers.'],
          ['First contact', 'Booked first try: booked without an unanswered call. Booked after follow-up: booked after one or more unanswered attempts or a follow-up. Not booked: no appointment yet.'],
          ['Where they are now', 'The stage of the lead’s project if it has one (Sold, Proposed, Lost, Dead Lead); otherwise Nurturing, Still working or Closed.'],
          ['Journey (table)', 'Each lead as a small picture: the dark dot is the lead coming in, the orange rings are no-response attempts, the next dot is the booked appointment (green-blue first try, orange after follow-up, empty if not booked), then the studio, then where the lead is now.']
        ] },
        { h: 'Stages' },
        { p: 'Sold, Lost, Proposed and Dead Lead are the stages used on every sales page. Dead Lead means a project that went quiet without being formally lost.' }
      ] },
      { id: 'colors', title: 'Colors', body: [
        { swatches: [
          [T.sold, 'Sold', 'Green always means sold.'],
          [T.lost, 'Lost', 'Orange always means lost.'],
          [T.prop, 'Proposed', 'Blue always means proposed.'],
          [T.dead, 'Dead Lead', 'Grey always means dead lead.'],
          [T.navy, 'Single numbers', 'Dark blue is used for charts that show one number, such as lead counts, so it never means sold or lost.'],
          [T.brand, 'Buttons and headings', 'The Inspired Closets red is only used for buttons and headings, never for data.']
        ] },
        { p: 'On the KPI Overview, a green <b>Ahead</b> pill means better than the same days of the last period, an orange <b>Behind</b> pill means worse, and a grey <b>Level</b> pill means within one percent.' }
      ] },
      { id: 'included', title: 'What is included and what is left out', body: [
        { list: [
          'Sales pages show 2026 and later by default. Older years are in the <b>Year</b> list.',
          'Projects that were sold and then cancelled are not counted as sold. This matches Salesforce.',
          'Test and practice records are left out.',
          'Designer availability blocks, such as “Available 1PM-3PM”, are left out of the Appointments pages. Other internal calendar entries, such as Hold Service or Office Work, are still counted.',
          'The Appointments pages can show future dates, because booked appointments are included.'
        ] }
      ] },
      { id: 'data', title: 'Where the data comes from and when it updates', body: [
        { list: [
          'Everything here is made-up demo data shaped like a real franchise’s Salesforce data: projects, leads, lead status history and calendar activities. Names, addresses and figures are fictional.',
          'The demo data is refreshed now and then, not every 30 minutes like a live franchise report. The <b>Data updated</b> chip at the top of this page shows when it was last generated.',
          'In a live franchise report, a change in Salesforce normally appears within an hour.'
        ] }
      ] }
    ],
    faqTitle: 'Questions you will probably ask',
    faqs: [
      ['Why is a page blank?', 'A filter is probably excluding everything. Open <b>Filters</b> and click <b>Clear all filters</b>, and open <b>Dates</b> and click <b>Clear</b>. A date range outside the chosen years shows nothing.'],
      ['Why does sold revenue differ from my Salesforce report?', 'This report counts a sale on the Original Project Sold Date and only while the stage is a sold stage. A Salesforce report that uses a different date, or includes cancelled jobs, shows a different total.'],
      ['Why does the KPI Overview not match the Lead Source page?', 'The KPI Overview always compares fixed periods: this year, this month and this week. The other pages follow the dates you pick.'],
      ['Why is a lead showing as Scheduled?', 'Scheduled is the Salesforce status for a lead with a booked appointment. It is shown exactly as in Salesforce.'],
      ['Can I see years before 2026?', 'Yes. Open <b>Dates</b> and tick earlier years in the <b>Year</b> list.'],
      ['Why do Sold Projects on Appointments not match Pipeline?', 'Appointments counts appointments linked to a sold project, while Pipeline counts each sold project once.'],
      ['Can I export a table?', 'Not from the report on the website: the public version does not allow exporting. If you have a Power BI login, open the report in Power BI, hover over a table, click the three dots at its top right and choose <b>Export data</b>.'],
      ['Why can I not filter the KPI Overview?', 'It always shows fixed periods, so this year can be compared with last year on the same days.']
    ]
  };

  var CSS = [
    'html,body{height:100%;margin:0}',
    '#ig-root{height:100vh;overflow:auto;box-sizing:border-box;padding:22px 28px 28px;color:', T.ink, ";font-family:'Segoe UI',system-ui,sans-serif;",
      'background:linear-gradient(180deg,#EDE2DE 0%,', T.ground, ' 22%,#F6F2EF 100%);border-top:4px solid ', T.brand, '}',
    '#ig-root *{box-sizing:border-box}',
    '.ig-eb{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:', T.brand, '}',
    ".ig-title{font-family:Georgia,'Times New Roman',serif;font-size:34px;margin:2px 0 8px}",
    '.ig-intro{font-size:16px;line-height:1.6;color:', T.sec, ';max-width:980px}',
    '.ig-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 18px}',
    '.ig-chip{font-size:13px;padding:5px 12px;border-radius:999px;background:', T.card, ';border:1px solid ', T.line, ';color:', T.sec, '}',
    '.ig-chip b{color:', T.ink, '}',
    '.ig-wrap{display:grid;grid-template-columns:240px minmax(0,1fr);gap:22px;align-items:start}',
    '.ig-nav{position:sticky;top:0;background:', T.card, ';border:1px solid ', T.line, ';border-radius:14px;padding:10px}',
    '.ig-nav a{display:block;padding:8px 10px;border-radius:8px;color:', T.sec, ';text-decoration:none;font-size:14px;line-height:1.35}',
    '.ig-nav a:hover{background:', T.brandTk, ';color:', T.brand, '}',
    '.ig-sec{background:', T.card, ';border:1px solid ', T.line, ';border-radius:14px;padding:18px 22px;margin-bottom:16px}',
    ".ig-sec h2{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:24px;margin:0 0 10px;color:", T.ink, '}',
    '.ig-sec h3{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:', T.brand, ';margin:16px 0 6px}',
    '.ig-sec p,.ig-sec li{font-size:15.5px;line-height:1.6;color:', T.sec, '}',
    '.ig-sec ul{margin:0;padding-left:20px}.ig-sec li{margin:4px 0}',
    '.ig-sec b{color:', T.ink, '}',
    '.ig-defs{display:grid;grid-template-columns:minmax(150px,230px) minmax(0,1fr);border-top:1px solid ', T.line, '}',
    '.ig-defs div{padding:9px 6px;border-bottom:1px solid ', T.line, ';font-size:15px;line-height:1.5;color:', T.sec, '}',
    '.ig-defs .t{font-weight:600;color:', T.ink, '}',
    '.ig-sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:10px}',
    '.ig-sw div{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid ', T.line, ';border-radius:10px;font-size:14.5px;line-height:1.45;color:', T.sec, '}',
    '.ig-sw i{flex:none;width:22px;height:22px;border-radius:6px;margin-top:1px}',
    '.ig-search{width:100%;font-size:15px;padding:10px 12px;border:1px solid ', T.line, ';border-radius:10px;margin:4px 0 12px;font-family:inherit}',
    '.ig-faq{border-top:1px solid ', T.line, '}',
    '.ig-faq details{border-bottom:1px solid ', T.line, ';padding:10px 4px}',
    '.ig-faq summary{cursor:pointer;font-size:15.5px;font-weight:600;color:', T.ink, '}',
    '.ig-faq p{margin:8px 0 2px}',
    '.ig-none{font-size:14px;color:', T.faint, ';padding:8px 4px;display:none}',
    '@media(max-width:900px){.ig-wrap{grid-template-columns:1fr}.ig-nav{position:static}.ig-defs{grid-template-columns:1fr}}'
  ].join('');

  function block(b) {
    if (b.p) return '<p>' + b.p + '</p>';
    if (b.h) return '<h3>' + b.h + '</h3>';
    if (b.list) return '<ul>' + b.list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
    if (b.defs) return '<div class="ig-defs">' + b.defs.map(function (d) { return '<div class="t">' + d[0] + '</div><div>' + d[1] + '</div>'; }).join('') + '</div>';
    if (b.swatches) return '<div class="ig-sw">' + b.swatches.map(function (s) { return '<div><i style="background:' + s[0] + '"></i><span><b>' + s[1] + '.</b> ' + s[2] + '</span></div>'; }).join('') + '</div>';
    return '';
  }

  function build(d) {
    var chips = '<div class="ig-chips">' +
      '<span class="ig-chip">Data updated <b>' + (d && d.updated ? d.updated : 'about every 30 minutes') + '</b></span>' +
      '<span class="ig-chip">Sales counted by <b>sold date</b></span>' +
      '<span class="ig-chip">Opens on <b>2026 and later</b></span>' +
      '<span class="ig-chip">Source <b>Demo data</b></span></div>';
    var nav = '<nav class="ig-nav">' + G.sections.map(function (s) { return '<a href="#ig-' + s.id + '" data-t="' + s.id + '">' + s.title + '</a>'; }).join('') +
      '<a href="#ig-faq" data-t="faq">' + G.faqTitle + '</a></nav>';
    var secs = G.sections.map(function (s) { return '<section class="ig-sec" id="ig-' + s.id + '"><h2>' + s.title + '</h2>' + s.body.map(block).join('') + '</section>'; }).join('');
    var faq = '<section class="ig-sec" id="ig-faq"><h2>' + G.faqTitle + '</h2><input class="ig-search" id="ig-q" placeholder="Search the questions" aria-label="Search the questions">' +
      '<div class="ig-faq" id="ig-faqs">' + G.faqs.map(function (f) { return '<details><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div><div class="ig-none" id="ig-none">No question matches that search.</div></section>';
    return '<div class="ig-eb">' + G.eyebrow + '</div><div class="ig-title">' + G.title + '</div><div class="ig-intro">' + G.intro + '</div>' + chips +
      '<div class="ig-wrap">' + nav + '<main>' + secs + faq + '</main></div>';
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('.ig-nav a') : null;
      if (!a) return;
      e.preventDefault();
      var el = root.querySelector('#ig-' + a.getAttribute('data-t'));
      if (el) root.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    });
    root.addEventListener('input', function (e) {
      if (e.target.id !== 'ig-q') return;
      var q = e.target.value.toLowerCase().trim(), shown = 0;
      Array.prototype.forEach.call(root.querySelectorAll('#ig-faqs details'), function (dt) {
        var hit = !q || dt.textContent.toLowerCase().indexOf(q) >= 0;
        dt.style.display = hit ? '' : 'none'; if (hit) { shown++; if (q) dt.open = true; }
      });
      root.querySelector('#ig-none').style.display = shown ? 'none' : 'block';
    });
  }

  var queued = false;
  function render() {
    if (queued) return; queued = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      queued = false;
      var root = document.getElementById('ig-root'); if (!root) return;
      if (!document.getElementById('ig-style')) { var s = document.createElement('style'); s.id = 'ig-style'; s.textContent = CSS; document.head.appendChild(s); }
      root.innerHTML = build(window.__demoGuide || {});
      if (!root.__wired) { wire(root); root.__wired = true; }
    });
  }
  window.DEMOGUIDE = { __installed: true, render: render, version: 'demo-guide-v1.0.0' };
  render();
})();
