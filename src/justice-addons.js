// HELPER UTILS
/*
* Recursively merge properties of two objects 
*/
function mergeRecursive(obj1, obj2) {

  for (var p in obj2) {
    try {
      // Property in destination object set; update its value.
      if ( obj2[p].constructor==Object ) {
        obj1[p] = MergeRecursive(obj1[p], obj2[p]);

      } else {
        obj1[p] = obj2[p];

      }

    } catch(e) {
      // Property in destination object not set; create it and set its value.
      obj1[p] = obj2[p];

    }
  }

  return obj1;
}

(function(win,doc){
var localDev = true; // for local debugging
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
var storedBudget = JSON.parse(win.sessionStorage.getItem(storageKey));
var storedScenario = JSON.parse(win.sessionStorage.getItem(scenarioKey));
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
  var budgetURL = localDev ? 'https://edge.fscdn.org/assets/budgets/performance-budget-jsonp.min.json' : '//edge.fscdn.org/assets/budgets/performance-budget-jsonp.min.json';
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
  win.sessionStorage.setItem(storageKey, JSON.stringify(data));
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
    win.sessionStorage.setItem(scenarioKey, JSON.stringify(data));
    if(cb) cb(data);
  } else {
    if(cb) cb();
  }
}

var defaultConfig;

function init(){
  console.log(arguments);
  var config = defaultConfig;                               // set default config to defaultConfig
  if (arguments.length > 0) {
    config = mergeRecursive(defaultConfig, arguments[0]);     // if user passes in overrides, use them
  }
  console.log('CONFIG:',config)
  Justice.init(config);
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

  defaultConfig = {
    metrics: {
      TTFB:             { budget: maxBudget.latency.max },
      domInteractive:   { budget: 250 },
      domComplete:      { budget: 100 },
      firstPaint:       { budget: maxBudget.FirstPaint.max || 1000 },
      pageLoad:         { budget: maxBudget.loadTime.max || 2000 },
      requests:         { budget: 6 }
    },
    warnThreshold: 0.8,
    showFPS: false,
    chartType: 'spline'
  };
  
  /* INIT */
  window.fsJustice = {
    init: init
  }
    
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

})(window,document);