////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//   Perfbar-mini                                                             //
//                                                                            //
//   DESCRIPTION:                                                             //
//   - A lighter, faster, mobile-first version of the perfbar for open-source //
//                                                                            //
//   FEATURES:                                                                //
//   - Supports external budgets                                              //
//   - Supports local overrides for more aggressive budgets                   //
//   - Supports local configs for setting scope presets?                      //
//   - Light, fast, mobile-first build                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

(function(win,doc){

// UTILS
function extend(obj /* , ...source */) {
  for (var i = 1; i < arguments.length; i++) {
    for (var key in arguments[i]) {
      if (Object.prototype.hasOwnProperty.call(arguments[i], key)) {
        obj[key] = arguments[i][key];
      }
    }
  }
  return obj;
}
var utils = {
  extend: extend
};


// CONFIG
var defaultConfig = {
  metrics: {

  }
};


// BUDGETS
var storageKey = 'fs-performance-budget';
var scenarioKey = storageKey+'-scenario';
var storedBudget = win.sessionStorage.get(storageKey);
var storedScenario = win.sessionStorage.get(scenarioKey);
//measure time from start to around perfbar init.
console.time('getBudget');
var defaultBudget;



// CONSTRUCTOR
var perfbarmini = function(config, budget){
  config = utils.extend(defaultConfig, config);
  budget = utils.extend(defaultBudget, budget);
};

perfbarmini.init = function(){
  // run tests
  // validate against budget
  // render template
  // show UI
};



// METRICS



// TEMPLATE



})(window, document);

perfbarmini({},{});
perfbarmini.init();
