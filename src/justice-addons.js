// HELPER UTILS
/*
* Recursively merge properties of two objects 
*/
function mergeRecursive(obj1, obj2) {
  for (var p in obj2) {
    try {
      // Property in destination object set; update its value.
      if ( obj2[p].constructor==Object ) {
        obj1[p] = mergeRecursive(obj1[p], obj2[p]);
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

// Justice Addons module
window.fsJustice = function(){
  var config = false;
  if(arguments.length > 0){
    config = arguments[0];
  }
  (function(win,doc){
    var localDev = true; // for local debugging
    var perfBarAddons = {
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
    // if(storedScenario){
    //   setScenario(storedScenario.pageType, storedScenario.connection);
    // } else {
      if(config.pageType){
        perfBarAddons.scenario.pageType = config.pageType;            // default state
      } else {
        perfBarAddons.scenario.pageType = 'landing';                  // default state
      }
      if(config.defaultConnection){
        perfBarAddons.scenario.connection = config.defaultConnection; // default state        
      } else {
        perfBarAddons.scenario.connection = 'cable-desktop';          // default state
      }
      setScenario(perfBarAddons.scenario.pageType, perfBarAddons.scenario.connection);
    // }

    if(storedBudget){
      perfBarAddons.budget = storedBudget;
      console.log('budget Stored', perfBarAddons.budget);
      initPerfBar(perfBarAddons.budget);
    } else {
      getNewData(function(data){
        perfBarAddons.budget = data;
        console.log('budget Gotten', perfBarAddons.budget);
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


    var defaultJusticeConfig; // hoisted


    function init(){
      console.log(arguments);
      var initConfig = defaultJusticeConfig;                               // set default config to defaultJusticeConfig
      if (arguments.length > 0) {
        initConfig = mergeRecursive(defaultJusticeConfig, arguments[0]);     // if user passes in overrides, use them
      }
      console.log('CONFIG:',config)
      // set page default scenario
      
      Justice.init(initConfig);
    }


    function initPerfBar(budget){
      /* let local overrides win budget defaults */
      if(config.budgets) {
        budget = config.budgets;
      }
      var currentBudget = config.budgets ? perfBarAddons.currentBudget = config.budgets[perfBarAddons.scenario.connection] : perfBarAddons.currentBudget = budget[perfBarAddons.scenario.pageType][perfBarAddons.scenario.connection];
      var maxBudget = {
        'loadTime': {
          max: config.gradeGoal ? currentBudget.LoadTime[config.gradeGoal] : currentBudget.LoadTime.D // Lower than D = "F" in category. P1 until raised to a "D"
        },
        'latency': {
          max: config.gradeGoal ? currentBudget.Latency[config.gradeGoal] : currentBudget.Latency.D // Lower than D = "F" in category. P1 until raised to a "D"
        },
        'FirstPaint': {
          max: config.gradeGoal ? currentBudget.FirstPaint[config.gradeGoal] : currentBudget.FirstPaint.D // Lower than D = "F" in category. P1 until raised to a "D"
        }
      };

      defaultJusticeConfig = {
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
      if(config.justice){
        init(config.justice);
      } else {
        init();
      }
    }


    function updatePerfBar(currentBudget){
      location.reload(); // override with page reload
    }

  })(window,document);
};