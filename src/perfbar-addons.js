/*
 *  perfBarAddons, made to add a shared, s3-hosted budget json file, configurable pagetypes, connections to perfbar
 */

// TODO: close the scope of this module off with a closure?
(function(win,doc){
var perfBarAddons = win.perfBarAddons = {
  scenario: {},
  budget: {},
  currentBudget: {}
};
/* BUDGETS.
 * One for Cable/Desktop
 * One for 3G/Mobile
 * TODO: swap budgets with persistence. For now, just test cable/desktop
 * TODO: get budgets via endpoint, so they will always be up-to-date, even when pins are not. "PerfBudget as a Service"
 */
var storageKey = 'fs-performance-budget';
var scenarioKey = storageKey+'-scenario';
var storedBudget = FS.sessionStorage.get(storageKey);
var storedScenario = FS.sessionStorage.get(scenarioKey);
//measure time from start to around perfbar init.
console.time('getBudget');
// don't need to check for date staleness, since this is sessionStorage, it expires when tab or browser is closed

// Set performance budget scenario
// read persistent state, if exists
if(storedScenario){
  setScenario(storedScenario.pageType, storedScenario.connection);
} else {
  perfBarAddons.scenario.pageType = 'landing';                  // default state
  perfBarAddons.scenario.connection = 'cable-desktop';          // default state
  setScenario(perfBarAddons.scenario.pageType, perfBarAddons.scenario.connection);
}

if(storedBudget){
  perfBarAddons.budget = storedBudget;
  initPerfBar(perfBarAddons.budget);
} else {
  getNewData(function(data){
    perfBarAddons.budget = data;
    initPerfBar(data);
  });
}

function getNewData(cb){
  var budgetURL = '//edge.fscdn.org/assets/budgets/performance-budget-jsonp.min.json';
  // vanillaJS AJAX jsonp call
  var scr = document.createElement('script');
  scr.src = budgetURL;
  document.body.appendChild(scr);
  // Had to hoist this at window level for jsonp to execute
  window.getData = function getData(data) {
    storeNewData(data, function(data1){
      cb(data1);
    });
  }
}


function storeNewData(data, cb) {
  perfBarAddons.budget = data;
  FS.sessionStorage.set(storageKey, data);
  if(cb) cb(data);
}


function setScenario(pageType, connection, cb){
  if(pageType){
    perfBarAddons.scenario.pageType = pageType;
  }
  if(connection){
    perfBarAddons.scenario.connection = connection;
  }
  // ubermode set to off by default, because its crazy.
  perfBarAddons.scenario.ubermode = 'off';
  storeNewScenario({
    pageType: perfBarAddons.scenario.pageType,
    connection: perfBarAddons.scenario.connection
  }, function(){
    if(cb) cb();
  });
}

// save persistent scenario state
function storeNewScenario(data, cb) {
  if(data.pageType && data.connection){
    FS.sessionStorage.set(scenarioKey, data);
    if(cb) cb(data);
  } else {
    if(cb) cb();
  }
}



function initPerfBar(budget){
  /* This budget reflects a General pagetype context, on a Cable Modem connection &
   * Desktop screen size (30Mb down, 1Mb up, 2ms latency/RTT) */
  var currentBudget = perfBarAddons.currentBudget = budget[perfBarAddons.scenario.pageType][perfBarAddons.scenario.connection];
  var maxBudget = {
    'speedIndex': {
      max: currentBudget.RUMSpeedIndex.D // Lower than D = "F" in category. P1 until raised to a "D"
    },
    'loadTime': {
      max: currentBudget.LoadTime.D // Lower than D = "F" in category. P1 until raised to a "D"
    },
    'latency': {
      max: currentBudget.Latency.D // Lower than D = "F" in category. P1 until raised to a "D"
    },
    'FirstPaint': {
      max: currentBudget.FirstPaint.D // Lower than D = "F" in category. P1 until raised to a "D"
    }
  };

  /* INIT */
  win.perfBar.init({
    lazy: false, // Load Time is messed up negative number when lazy load is on.
    budget: maxBudget
  });
}

function updatePerfBar(currentBudget){
  // update each metric with the new scenario's budget max numbers
  // for(var key in currentBudget) {
  //   perfBar.updateMetric(key,{
  //     budget: {
  //       max: currentBudget[key].D
  //     }
  //   });
  // }
  location.reload(); // perfBar.updateMetric seems to not update budgets, just values. override with page reload
}

// function checkPerfBarInjected(){
//   var el = doc.getElementById('perfBar');
//   if(el){
//     loadDeferreds();
//   } else {
//     setTimeout( checkPerfBarInjected, 100);
//   }
// }

function setUberMode(value, cb) {
  if(perfBarAddons.scenario.ubermode !== value) {
    perfBarAddons.scenario.ubermode = value;
    if(cb) cb();
  }
}

function loadDeferreds(){
  win.addEventListener('load', function(){
    // return checked if item matches scenario
    function isChecked(type, value) {
      var checked = '';
      if(type == 'pageType'){
        checked = (perfBarAddons.scenario.pageType == value) ? 'checked' : '';
      }
      if(type == 'connection'){
        checked = (perfBarAddons.scenario.connection == value) ? 'checked' : '';
      }
      if(type == 'ubermode'){
        checked = (perfBarAddons.scenario.ubermode == value) ? 'checked' : '';
      }
      return checked;
    }

    if(win.RUMSpeedIndex){
      var speedIndexBarMetric = perfBar.addMetric({
        id: 'speedIndex',
        label: 'Speed Index', // human readable name
        value: Math.round(win.RUMSpeedIndex()),
        budget: perfBarAddons.currentBudget.RUMSpeedIndex.D
      });
    }

    // create new content for perfbar
    var switches = document.createElement('div');
    switches.innerHTML = '<div>'+
      '<abbr title="Compare page against different budgets per pagetype">'+
        '<h3 class="perfBar-label">Pagetype:</h3>'+
        '<div class="switch">'+
          '<input type="radio" class="switch-input" name="pagetype" value="landing" id="landing" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('pageType', 'landing') + '>'+
          '<label for="landing" class="switch-label switch-label-off">Landing</label>'+
          '<input type="radio" class="switch-input" name="pagetype" value="general" id="general" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('pageType', 'general') + '>'+
          '<label for="general" class="switch-label switch-label-on">General</label>'+
          '<span class="switch-selection"></span>'+
        '</div>'+
      '</abbr>'+
    '</div>'+
    '<div>'+
      '<abbr title="Compare page against different budgets per connection type">'+
        '<h3 class="perfBar-label">Connection:</h3>'+
        '<div class="switch">'+
          '<input type="radio" class="switch-input" name="connection" value="cable-desktop" id="cable-desktop" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('connection', 'cable-desktop') + '>'+
          '<label for="cable-desktop" class="switch-label switch-label-off">Cable</label>'+
          '<input type="radio" class="switch-input" name="connection" value="3G-mobile" id="3G-mobile" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('connection', '3G-mobile') + '>'+
          '<label for="3G-mobile" class="switch-label switch-label-on">3G</label>'+
          '<span class="switch-selection"></span>'+
        '</div>'+
      '</abbr>'+
    '</div>'+
    '<div>'+
      '<abbr title="Enables ALL of the metrics. Hold on tight!">'+
        '<h3 class="perfBar-label">Ubermode:</h3>'+
        '<div class="switch">'+
          '<input type="radio" class="switch-input" name="ubermode" value="off" id="ubermode-off" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('ubermode', 'off') + '>'+
          '<label for="ubermode-off" class="switch-label switch-label-off">Simple</label>'+
          '<input type="radio" class="switch-input" name="ubermode" value="on" id="ubermode-on" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('ubermode', 'on') + '>'+
          '<label for="ubermode-on" class="switch-label switch-label-on">UBER!</label>'+
          '<span class="switch-selection"></span>'+
        '</div>'+
      '</abbr>'+
    '</div>'

    switches.className = 'perfBar-switches';
    var statsElem = document.querySelector('.perfBar-stats');

    // inject new content onto perfbar
    statsElem.appendChild(switches, statsElem.firstChild);

    // bind budget toggles
    perfBarAddons.handleSwitchClick = function(myRadio) {
      if(myRadio.name === 'pagetype'){
        setScenario(myRadio.value, null, null, function(){
          updatePerfBar(perfBarAddons.currentBudget);
        });
      } else if(myRadio.name === 'connection') {
        setScenario(null, myRadio.value, null, function(){
          updatePerfBar(perfBarAddons.currentBudget);
        })
      } else if(myRadio.name === 'ubermode') {
        // toggle css class on plugin to toggle mode
        setUberMode(myRadio.value, function(){
          doc.getElementById('perfBar').classList.toggle('ubermode');
        })
      } else {
        console.error('ERROR: Perfbar >> perfbarHandleClick : not a valid switch');
      }
      console.log('PerfBar: New performance budget scenario. Pagetype:',perfBarAddons.scenario.pageType,'Connection:',perfBarAddons.scenario.connection);
    }
  });
}

// checkPerfBarInjected();
loadDeferreds();

})(window,document);
