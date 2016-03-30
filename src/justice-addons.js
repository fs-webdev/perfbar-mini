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
  config.gradeGoal = config.gradeGoal || 'D'; // set default gradeGoal to 'D' unless specified
  (function(win,doc){
    var localDev = true; // for local debugging
    var perfBarAddons = window.perfBarAddons = {
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
      var initConfig = defaultJusticeConfig;                               // set default config to defaultJusticeConfig
      if (arguments.length > 0) {
        // set page default scenario
        initConfig = mergeRecursive(defaultJusticeConfig, arguments[0]);     // if user passes in overrides, use them
      }
      win.console.log('Perfbar config:',initConfig);
      Justice.init(initConfig);
      afterRender();  // do things that happen after justice ui render
    }


    function initPerfBar(budget){
      /* let local overrides win budget defaults */
      if(config.budgets) {
        budget = config.budgets;
      }
      var currentBudget = config.budgets ? perfBarAddons.currentBudget = config.budgets[perfBarAddons.scenario.connection] : perfBarAddons.currentBudget = budget[perfBarAddons.scenario.pageType][perfBarAddons.scenario.connection];
      var maxBudget = {
        'loadTime': {
          max: currentBudget.LoadTime[config.gradeGoal]
        },
        'latency': {
          max: currentBudget.Latency[config.gradeGoal]
        },
        'FirstPaint': {
          max: currentBudget.FirstPaint[config.gradeGoal]
        }
      };
      if(currentBudget.domInteractive) {
        maxBudget.domInteractive = currentBudget.FirstPaint[config.gradeGoal];
      }

      defaultJusticeConfig = {
        metrics: {
          TTFB:             { budget: maxBudget.latency.max },
          domInteractive:   { budget: maxBudget.domInteractive ? maxBudget.domInteractive.max : 250 },
          domComplete:      { budget: maxBudget.domComplete ? maxBudget.domComplete.max : 100 },
          firstPaint:       { budget: maxBudget.FirstPaint.max || 1000 },
          pageLoad:         { budget: maxBudget.loadTime.max || 2000 },
          requests:         { budget: maxBudget.requests ? maxBudget.requests.max : 6 }
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


    function updatePerfBar(){
      win.location.reload(); // override with page reload
    }
    
    function afterRender() { // do things after justice UI has been rendered
      win.requestAnimationFrame(function(){
        var ui = document.getElementById('justice');
        if(!ui) {
          return afterRender();
        } else {
          loadDeferreds();
        }
      });
    }
    
    function loadDeferreds(){
      // return checked if item matches scenario
      function isChecked(type, value) {
        var checked = '';
        if(type == 'pageType'){
          checked = (perfBarAddons.scenario.pageType == value) ? 'checked' : '';
        }
        if(type == 'connection'){
          checked = (perfBarAddons.scenario.connection == value) ? 'checked' : '';
        }
        return checked;
      }

      // create new content for perfbar
      var switches = doc.createElement('div');
      switches.innerHTML = ''+
      '<div class="justice-switch">'+
        '<abbr title="Compare page against different budgets per pagetype">'+
          '<h5 class="perfBar-label">Pagetype:</h3>'+
          '<div class="switch">'+
            '<input type="radio" class="switch-input" name="pagetype" value="landing" id="landing" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('pageType', 'landing') + '>'+
            '<label for="landing" class="switch-label switch-label-off">Landing</label>'+
            '<input type="radio" class="switch-input" name="pagetype" value="general" id="general" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('pageType', 'general') + '>'+
            '<label for="general" class="switch-label switch-label-on">General</label>'+
            '<span class="switch-selection"></span>'+
          '</div>'+
        '</abbr>'+
      '</div>'+
      '<div class="justice-switch">'+
        '<abbr title="Compare page against different budgets per connection type">'+
          '<h5 class="perfBar-label">Connection:</h3>'+
          '<div class="switch">'+
            '<input type="radio" class="switch-input" name="connection" value="cable-desktop" id="cable-desktop" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('connection', 'cable-desktop') + '>'+
            '<label for="cable-desktop" class="switch-label switch-label-off">Cable</label>'+
            '<input type="radio" class="switch-input" name="connection" value="3G-mobile" id="3G-mobile" onclick="perfBarAddons.handleSwitchClick(this)" ' + isChecked('connection', '3G-mobile') + '>'+
            '<label for="3G-mobile" class="switch-label switch-label-on">3G</label>'+
            '<span class="switch-selection"></span>'+
          '</div>'+
        '</abbr>'+
      '</div>';

      switches.className = 'justice-scenarios closed';
      switches.id = 'justice-scenarios';
      
      var switchToggle = doc.createElement('div');
      switchToggle.className = 'justice-switch-toggle';
      switchToggle.innerHTML = '<a href="#" id="justice-switch-toggle-button" onclick="perfBarAddons.handleSwitchToggleClick(); return false;" title="Set Default Scenario">+</a>';
      
      var statsElem = doc.getElementById('justice');
      var scenariosElem = doc.querySelector('.justice-scenarios');

      // inject new content onto perfbar
      statsElem.appendChild(switchToggle, statsElem.firstChild);
      statsElem.appendChild(switches, statsElem.firstChild);

      // toggle switch area visibility
      perfBarAddons.handleSwitchToggleClick = function() {
        var switchElem = doc.getElementById('justice-scenarios');
        switchElem.classList.toggle('closed');
      }

      // bind budget toggles
      perfBarAddons.handleSwitchClick = function(myRadio) {
        if(myRadio.name === 'pagetype'){
          setScenario(myRadio.value, null, function() {
            console.log('pagetype switch changed!');
            updatePerfBar();
          });
        } else if(myRadio.name === 'connection') {
          setScenario(null, myRadio.value, function() {
            console.log('connection switch changed!');
            updatePerfBar();
          })
        } else {
          console.error('ERROR: Perfbar >> perfbarHandleClick : not a valid switch');
        }
        console.log('PerfBar: New performance budget scenario. Pagetype:',perfBarAddons.scenario.pageType,'Connection:',perfBarAddons.scenario.connection);
      }
    }

  })(window,document);
};