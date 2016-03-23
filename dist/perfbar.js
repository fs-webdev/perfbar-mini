/******************************************************************************
Copyright (c) 2014, Google Inc.
All rights reserved.
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of the <ORGANIZATION> nor the names of its contributors
    may be used to endorse or promote products derived from this software
    without specific prior written permission.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
******************************************************************************/

/******************************************************************************
*******************************************************************************
  Calculates the Speed Index for a page by:
  - Collecting a list of visible rectangles for elements that loaded
    external resources (images, background images, fonts)
  - Gets the time when the external resource for those elements loaded
    through Resource Timing
  - Calculates the likely time that the background painted
  - Runs the various paint rectangles through the SpeedIndex calculation:
    https://sites.google.com/a/webpagetest.org/docs/using-webpagetest/metrics/speed-index
  TODO:
  - Improve the start render estimate
  - Handle overlapping rects (though maybe counting the area as multiple paints
    will work out well)
  - Detect elements with Custom fonts and the time that the respective font
    loaded
  - Better error handling for browsers that don't support resource timing
*******************************************************************************
******************************************************************************/

var RUMSpeedIndex = function(win) {
  win = win || window;
  var doc = win.document;
    
  /****************************************************************************
    Support Routines
  ****************************************************************************/
  // Get the rect for the visible portion of the provided DOM element
  var GetElementViewportRect = function(el) {
    var intersect = false;
    if (el.getBoundingClientRect) {
      var elRect = el.getBoundingClientRect();
      intersect = {'top': Math.max(elRect.top, 0),
                       'left': Math.max(elRect.left, 0),
                       'bottom': Math.min(elRect.bottom, (win.innerHeight || doc.documentElement.clientHeight)),
                       'right': Math.min(elRect.right, (win.innerWidth || doc.documentElement.clientWidth))};
      if (intersect.bottom <= intersect.top ||
          intersect.right <= intersect.left) {
        intersect = false;
      } else {
        intersect.area = (intersect.bottom - intersect.top) * (intersect.right - intersect.left);
      }
    }
    return intersect;
  };

  // Check a given element to see if it is visible
  var CheckElement = function(el, url) {
    if (url) {
      var rect = GetElementViewportRect(el);
      if (rect) {
        rects.push({'url': url,
                     'area': rect.area,
                     'rect': rect});
      }
    }
  };

  // Get the visible rectangles for elements that we care about
  var GetRects = function() {
    // Walk all of the elements in the DOM (try to only do this once)
    var elements = doc.getElementsByTagName('*');
    var re = /url\((http.*)\)/ig;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var style = win.getComputedStyle(el);

      // check for Images
      if (el.tagName == 'IMG') {
        CheckElement(el, el.src);
      }
      // Check for background images
      if (style['background-image']) {
        re.lastIndex = 0;
        var matches = re.exec(style['background-image']);
        if (matches && matches.length > 1)
          CheckElement(el, matches[1]);
      }
      // recursively walk any iFrames
      if (el.tagName == 'IFRAME') {
        try {
          var rect = GetElementViewportRect(el);
          if (rect) {
            var tm = RUMSpeedIndex(el.contentWindow);
            if (tm) {
              rects.push({'tm': tm,
                          'area': rect.area,
                          'rect': rect});
            }
        }
        } catch(e) {
        }
      }
    }
  };

  // Get the time at which each external resource loaded
  var GetRectTimings = function() {
    var timings = {};
    var requests = win.performance.getEntriesByType("resource");
    for (var i = 0; i < requests.length; i++)
      timings[requests[i].name] = requests[i].responseEnd;
    for (var j = 0; j < rects.length; j++) {
      if (!('tm' in rects[j]))
        rects[j].tm = timings[rects[j].url] !== undefined ? timings[rects[j].url] : 0;
    }
  };

  // Get the first paint time.
  var GetFirstPaint = function() {
    // If the browser supports a first paint event, just use what the browser reports
    if ('msFirstPaint' in win.performance.timing)
      firstPaint = win.performance.timing.msFirstPaint - navStart;
    if ('chrome' in win && 'loadTimes' in win.chrome) {
      var chromeTimes = win.chrome.loadTimes();
      if ('firstPaintTime' in chromeTimes && chromeTimes.firstPaintTime > 0) {
        var startTime = chromeTimes.startLoadTime;
        if ('requestTime' in chromeTimes)
          startTime = chromeTimes.requestTime;
        if (chromeTimes.firstPaintTime >= startTime)
          firstPaint = (chromeTimes.firstPaintTime - startTime) * 1000.0;
      }
    }
    // For browsers that don't support first-paint or where we get insane values,
    // use the time of the last non-async script or css from the head.
    if (firstPaint === undefined || firstPaint < 0 || firstPaint > 120000) {
      firstPaint = win.performance.timing.responseStart - navStart;
      var headURLs = {};
      var headElements = doc.getElementsByTagName('head')[0].children;
      for (var i = 0; i < headElements.length; i++) {
        var el = headElements[i];
        if (el.tagName == 'SCRIPT' && el.src && !el.async)
          headURLs[el.src] = true;
        if (el.tagName == 'LINK' && el.rel == 'stylesheet' && el.href)
          headURLs[el.href] = true;
      }
      var requests = win.performance.getEntriesByType("resource");
      var doneCritical = false;
      for (var j = 0; j < requests.length; j++) {
        if (!doneCritical &&
            headURLs[requests[j].name] &&
           (requests[j].initiatorType == 'script' || requests[j].initiatorType == 'link')) {
          var requestEnd = requests[j].responseEnd;
          if (firstPaint === undefined || requestEnd > firstPaint)
            firstPaint = requestEnd;
        } else {
          doneCritical = true;
        }
      }
    }
    firstPaint = Math.max(firstPaint, 0);
  };

  // Sort and group all of the paint rects by time and use them to
  // calculate the visual progress
  var CalculateVisualProgress = function() {
    var paints = {'0':0};
    var total = 0;
    for (var i = 0; i < rects.length; i++) {
      var tm = firstPaint;
      if ('tm' in rects[i] && rects[i].tm > firstPaint)
        tm = rects[i].tm;
      if (paints[tm] === undefined)
        paints[tm] = 0;
      paints[tm] += rects[i].area;
      total += rects[i].area;
    }
    // Add a paint area for the page background (count 10% of the pixels not
    // covered by existing paint rects.
    var pixels = Math.max(doc.documentElement.clientWidth, win.innerWidth || 0) *
                 Math.max(doc.documentElement.clientHeight, win.innerHeight || 0);
    if (pixels > 0 ) {
      pixels = Math.max(pixels - total, 0) * pageBackgroundWeight;
      if (paints[firstPaint] === undefined)
        paints[firstPaint] = 0;
      paints[firstPaint] += pixels;
      total += pixels;
    }
    // Calculate the visual progress
    if (total) {
      for (var time in paints) {
        if (paints.hasOwnProperty(time)) {
          progress.push({'tm': time, 'area': paints[time]});
        }
      }
      progress.sort(function(a,b){return a.tm - b.tm;});
      var accumulated = 0;
      for (var j = 0; j < progress.length; j++) {
        accumulated += progress[j].area;
        progress[j].progress = accumulated / total;
      }
    }
  };

  // Given the visual progress information, Calculate the speed index.
  var CalculateSpeedIndex = function() {
    if (progress.length) {
      SpeedIndex = 0;
      var lastTime = 0;
      var lastProgress = 0;
      for (var i = 0; i < progress.length; i++) {
        var elapsed = progress[i].tm - lastTime;
        if (elapsed > 0 && lastProgress < 1)
          SpeedIndex += (1 - lastProgress) * elapsed;
        lastTime = progress[i].tm;
        lastProgress = progress[i].progress;
      }
    } else {
      SpeedIndex = firstPaint;
    }
  };

  /****************************************************************************
    Main flow
  ****************************************************************************/
  var rects = [];
  var progress = [];
  var firstPaint;
  var SpeedIndex;
  var pageBackgroundWeight = 0.1;
  try {
    var navStart = win.performance.timing.navigationStart;
    GetRects();
    GetRectTimings();
    GetFirstPaint();
    CalculateVisualProgress();
    CalculateSpeedIndex();
  } catch(e) {
  }
  /* Debug output for testing
  var dbg = '';
  dbg += "Paint Rects\n";
  for (var i = 0; i < rects.length; i++)
    dbg += '(' + rects[i].area + ') ' + rects[i].tm + ' - ' + rects[i].url + "\n";
  dbg += "Visual Progress\n";
  for (var i = 0; i < progress.length; i++)
    dbg += '(' + progress[i].area + ') ' + progress[i].tm + ' - ' + progress[i].progress + "\n";
  dbg += 'First Paint: ' + firstPaint + "\n";
  dbg += 'Speed Index: ' + SpeedIndex + "\n";
  console.log(dbg);
  */
  return SpeedIndex;
};
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = function () {

  if (typeof window.Element === "undefined" || "classList" in document.documentElement) return;

  var prototype = Array.prototype,
      push = prototype.push,
      splice = prototype.splice,
      join = prototype.join;

  function DOMTokenList(el) {
    this.el = el;
    // The className needs to be trimmed and split on whitespace
    // to retrieve a list of classes.
    var classes = el.className.replace(/^\s+|\s+$/g,'').split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      push.call(this, classes[i]);
    }
  }

  DOMTokenList.prototype = {
    add: function(token) {
      if(this.contains(token)) return;
      push.call(this, token);
      this.el.className = this.toString();
    },
    contains: function(token) {
      return this.el.className.indexOf(token) != -1;
    },
    item: function(index) {
      return this[index] || null;
    },
    remove: function(token) {
      if (!this.contains(token)) return;
      for (var i = 0; i < this.length; i++) {
        if (this[i] == token) break;
      }
      splice.call(this, i, 1);
      this.el.className = this.toString();
    },
    toString: function() {
      return join.call(this, ' ');
    },
    toggle: function(token) {
      if (!this.contains(token)) {
        this.add(token);
      } else {
        this.remove(token);
      }

      return this.contains(token);
    }
  };

  window.DOMTokenList = DOMTokenList;

  function defineElementGetter (obj, prop, getter) {
      if (Object.defineProperty) {
          Object.defineProperty(obj, prop,{
              get : getter
          });
      } else {
          obj.__defineGetter__(prop, getter);
      }
  }

  defineElementGetter(Element.prototype, 'classList', function () {
    return new DOMTokenList(this);
  });

}



},{}],2:[function(require,module,exports){
window.perfBar = window.perfBar || {};


(function() {


  perfBar.init = function(config) {
    var classList = require('./classList.js')
    var barTemplate = require('./templates/bar.hbs')

    this.el = document.createElement('div');
    this.el.innerHTML = barTemplate();
    document.body.appendChild(this.el);

    // classList polyfill
    classList()

    // caching elements
    this.metricsContainer = this.el.querySelector('.perfBar-cf')
    this.disabledMetrics = {}

    config = config || {}
    this.config = config

    // private method that handles clicks on #perfBar (show/hide) stuff.
    _handleClick()

    // no window.performance? no partyy :( – I'm looking at you Safari!
    this.perf = window.performance || window.msPerformance || window.webkitPerformance || window.mozPerformance;

    // if perfBar is lazy loaded then ignore onload
    if ( config.lazy ) {
      this.__runner()
      return
    }
    window.onload = this.__runner

  }

  perfBar.__runner = function() {
    setTimeout(function() {
      if ( perfBar.perf )  {
        perfBar.runPerfMetrics('perf')
      }

      perfBar.runPerfMetrics('others')
    }, 1000)
  }



  perfBar.metricTemplate = function(metric) {
    var template = require('./templates/stat.hbs')

    var budget = metric.budget

    if ( budget && Object.keys(budget).length ) {
      createHint(metric)
      metric.isGood = budget.max >= metric.value || budget.min <= metric.value;
      metric.isBad = budget.max <= metric.value || budget.min >= metric.value;
    }

    return template(metric)
  }

  perfBar.metrics = {}


  perfBar.addMetric = function(metric) {
    if ( typeof metric !== 'object' ) return new Error('metric is not an Object.')
    if ( !metric.id )    return new Error('Id can\'t be empty.')
    if ( !metric.label ) return new Error('Label can\'t be empty.')
    if ( !metric.hasOwnProperty('value') ) return new Error('Value can\'t be empty.')

    // if metric is disabled do nothing
    if ( this.disabledMetrics[metric.id] ) return;

    this.mergeBudget(metric)

    var el = document.getElementById("perfBar-metric-" + metric.id)

    // if metric is already created with the same id, then overwrite it.
    if ( this.metrics[metric.id] && el ) {
      el.outerHTML = this.metricTemplate(metric)
      this.metrics[metric.id] = metric
      return
    }

    this.metricsContainer.innerHTML += this.metricTemplate(metric)

    this.metrics[metric.id] = metric


  }

  perfBar.updateMetric = function(id, update) {
    if ( typeof update !== 'object' ) return new Error('update is not an Object.')

    if ( !Object.keys(update).length ) return;

    if ( !this.metrics[id] ) {
      update.id = id;
      return this.addMetric(update);
    }

    for ( var key in update ) {
      if ( !update.hasOwnProperty(key) ) return;

      switch (key) {
        case "value":
          this.metrics[id].value = update[key]
          break
        case "label":
          this.metrics[id].label = update[key]
          break
        case "unit":
          this.metrics[id].unit  = update[key]
          break
        case "budget":
          this.metrics[id].budget  = update[key]
          break
      }
    }

    document.getElementById("perfBar-metric-" + id).outerHTML = this.metricTemplate(this.metrics[id])
  }

  perfBar.deleteMetric = function(id) {
    if ( !id || !this.metrics[id] ) return;

    (document.getElementById("perfBar-metric-" + id)).remove()
    return delete this.metrics[id];
  }

  perfBar.enable = function(id) {
    if ( !id ) return;
    if ( !this.disabledMetrics[id] ) return true;

    delete this.disabledMetrics[id]

    if ( this.metrics[id] ) this.addMetric(this.metrics[id])

    return true
  }

  perfBar.disable = function(id) {
    if ( !id ) return;
    if ( this.disabledMetrics[id] ) return true;

    this.disabledMetrics[id] = this.metrics[id]

    return (document.getElementById("perfBar-metric-" + id)).remove()
  }

  var perfMetrics = { perf: [], others: [] }
  perfBar.runPerfMetrics = function(type) {
    for (var i = 0; i < perfMetrics[type].length; i++) {
      perfMetrics[type][i]()
    }

    delete perfMetrics[type];
  }


  perfMetrics.perf.push(function addLoadTime() {
    perfBar.addMetric({
      id: 'loadTime',
      value: ( perfBar.perf.timing.loadEventStart - perfBar.perf.timing.navigationStart ),
      unit: 'ms',
      label: 'Load Time',
      budget: {
        max: 5000
      }
    })
  })


  perfMetrics.perf.push(function addLatency() {
    perfBar.addMetric({
      id: 'latency',
      value: ( perfBar.perf.timing.responseStart - perfBar.perf.timing.connectStart ) ,
      unit: 'ms',
      label: 'Latency',
      budget: {
        max: 50
      }
    })
  })

  perfMetrics.perf.push(function addFirstPaint() {
    var firstPaint = 0
    var firstPaintTime = 0

    // Taken from https://github.com/addyosmani/timing.js
    // Chrome
    if (window.chrome && window.chrome.loadTimes) {
        // Convert to ms
        firstPaint = window.chrome.loadTimes().firstPaintTime * 1000
        firstPaintTime = firstPaint - (window.chrome.loadTimes().startLoadTime*1000)
    }
    // IE
    else if (typeof window.performance.timing.msFirstPaint === 'number') {
        firstPaint = window.performance.timing.msFirstPaint
        firstPaintTime = firstPaint - window.performance.timing.navigationStart
    }

    if ( !firstPaintTime ) return
    perfBar.addMetric({
      id: 'FirstPaint',
      value: Math.round(firstPaintTime),
      unit: 'ms',
      label: 'First Paint',
      budget: {
        max: 100
      }
    })
  })

  perfMetrics.perf.push(function addReqsNum() {
    var numReqs = "N/A"

    if ( "getEntriesByType" in window.performance ) {
      numReqs = window.performance.getEntriesByType("resource").length
    }

    perfBar.addMetric({
      id: 'numReqs',
      value: numReqs,
      label: 'Number of requests'
    })
  })

  perfMetrics.perf.push(function addFrontEnd() {
    var max = Math.round( ( perfBar.perf.timing.loadEventStart - perfBar.perf.timing.navigationStart ) * 0.8 )

    perfBar.addMetric({
      id: 'frontEnd',
      value: (perfBar.perf.timing.loadEventStart - perfBar.perf.timing.responseEnd ),
      unit: 'ms',
      label: 'Front End',
      budget: {
        max: max
      }
    })
  })

  perfMetrics.perf.push(function addBackEnd() {
    var max = Math.round( ( perfBar.perf.timing.loadEventStart - perfBar.perf.timing.navigationStart ) * 0.2 )

    perfBar.addMetric({
      id: 'backEnd',
      value: (perfBar.perf.timing.responseEnd - perfBar.perf.timing.navigationStart ),
      unit: 'ms',
      label: 'Back End',
      budget: {
        max: max
      }
    })

  })

  perfMetrics.perf.push(function addResDuration() {
    perfBar.addMetric({
      id: 'respnseDuration',
      value: (perfBar.perf.timing.responseEnd - perfBar.perf.timing.responseStart ),
      unit: 'ms',
      label: 'Response Duration',
    })
  })

  perfMetrics.perf.push(function addReqDuration() {
    perfBar.addMetric({
      id: 'requestDuration',
      value: (perfBar.perf.timing.responseStart - perfBar.perf.timing.requestStart ),
      unit: 'ms',
      label: 'Request Duration',
    })
  })

  perfMetrics.perf.push(function addRedirectsCount() {
    if ( !perfBar.perf.navigation ) return
    perfBar.addMetric({
      id: 'redirectCount',
      value: perfBar.perf.navigation.redirectCount,
      label: 'Redirects',
    })
  })

  perfMetrics.perf.push(function addLoadEventTime() {
    perfBar.addMetric({
      id: 'loadEventTime',
      value: (perfBar.perf.timing.loadEventEnd - perfBar.perf.timing.loadEventStart ),
      unit: 'ms',
      label: 'Load Event duration',
    })
  })

  perfMetrics.perf.push(function addDomLoaded() {
    perfBar.addMetric({
      id: 'domContentLoaded',
      value: (perfBar.perf.timing.domContentLoadedEventStart - perfBar.perf.timing.domInteractive ),
      unit: 'ms',
      label: 'DOM Content loaded',
    })
  })


  perfMetrics.perf.push(function addProcessing() {
    perfBar.addMetric({
      id: 'processing',
      value: perfBar.perf.timing.loadEventStart - perfBar.perf.timing.domLoading,
      unit: 'ms',
      label: 'Processing Duration',
    })
  })

  perfMetrics.others.push(function addNumOfEl() {
    perfBar.addMetric({
      id: 'numOfEl',
      value: document.documentElement.querySelectorAll('*').length,
      label: 'DOM elements',
    })
  })

  perfMetrics.others.push(function addCssCount() {
    perfBar.addMetric({
      id: 'cssCount',
      value: document.querySelectorAll('link[rel="stylesheet"]').length,
      label: 'CSS',
    })
  })

  perfMetrics.others.push(function addJsCount() {
    perfBar.addMetric({
      id: 'jsCount',
      value: document.querySelectorAll('script').length,
      label: 'JavaScript',
    })
  })

  perfMetrics.others.push(function addImgCount() {
    perfBar.addMetric({
      id: 'imgCount',
      value: document.querySelectorAll('img').length,
      label: 'Images',
    })
  })

  perfMetrics.others.push(function addDataURI() {
    var count = 0
    var images = document.querySelectorAll('img[src]')

    for (var i = 0; i < images.length; i++) {
      if ( images[i].src.match(/^data:+/) ) count++
    }
    perfBar.addMetric({
      id: 'dataURIImagesCount',
      value: count,
      label: 'Data URI images',
    })
  })

  perfMetrics.others.push(function addInlineCssCount() {
    perfBar.addMetric({
      id: 'inlineCSSCount',
      value: document.querySelectorAll('style').length,
      label: 'Inline CSS',
    })

  })

  perfMetrics.others.push(function addInlineCss() {
    var js = document.querySelectorAll('script')
    var count = 0
    for (var i = 0; i < js.length; i++) {
      if ( !js[i].src ) count++
    }

    perfBar.addMetric({
      id: 'inlineJSCount',
      value: count,
      label: 'Inline JavaScript',
    })
  })

  perfMetrics.others.push(function add3rdCss() {
    var css = document.querySelectorAll('link[rel="stylesheet"]')
    var links = []
    for (var i = 0; i < css.length; i++) {
      links.push(css[i].href)
    }
    var count = isThirdParty(links)

    perfBar.addMetric({
      id: 'thirdCSS',
      value: count,
      label: '3rd Party CSS',
    })
  })

  perfMetrics.others.push(function add3rdCss() {
    var js = document.querySelectorAll('script[src]')
    var links = []
    for (var i = 0; i < js.length; i++) {
      links.push(js[i].src)
    }
    var count = isThirdParty(links)
    perfBar.addMetric({
      id: 'thirdJS',
      value: count,
      label: '3rd Party JavaScript',
    })
  })


  perfBar.mergeBudget = function(metric) {
    if ( !this.config.budget ) return
    if ( !this.config.budget[metric.id] ) return

    var budget = this.config.budget

    if ( !metric.budget || typeof metric.budget != "object" ) {
      metric.budget = budget[metric.id]
      return
    }

    if ( budget[metric.id].max ) metric.budget.max = budget[metric.id].max
    if ( budget[metric.id].min ) metric.budget.min = budget[metric.id].min

  }

  function createHint(metric) {
    var budget = metric.budget
    var minText = "Min Value is "
    var maxText = "Max Value is "
    var unitText = metric.unit || ""
    var hint = []

    if ( budget.hasOwnProperty('min') )
      hint.push(minText + budget.min + unitText + ".")

    if ( budget.hasOwnProperty('max') )
      hint.push(maxText + budget.max + unitText + ".")

    metric.hint = hint.join(" ")
  }


  function isThirdParty(links) {
    var a = document.createElement('a')
    var counter = 0

    for (var i = 0; i < links.length; i++) {
      a.href = links[i]
      if ( a.hostname != window.location.hostname ) counter++
    }

    return counter
  }



  // private method that handles clicks on #perfBar (show/hide) stuff.
  function _handleClick() {
    perfBar.el.querySelector('.perfBar-bar').addEventListener('click', function(e) {
      perfBar.el.classList.toggle('perfBar-is-active')
    })
  }

})()

},{"./classList.js":1,"./templates/bar.hbs":3,"./templates/stat.hbs":4}],3:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  return "<style>\n/* \nto make sure perfBar doesn't overlap \nwith the content when you reach the bottom of the page\n*/\nbody {\n  padding-bottom: 40px;\n}\n\n\n#perfBar, #perfBar:before, #perfBar:after, #perfBar *, #perfBar *:before, #perfBar *:after {\n  -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box;\n }\n\n#perfBar {\n  position: fixed;\n  width: 100%;\n  bottom: 0;\n  left: 0;\n  padding: 0;\n  z-index: 999;\n  \n\n  color: #333;\n  font-weight: 200;\n  font-size: 16px;\n  background: #EFEFEF;\n  border-top: 1px solid #dedede;\n  font-family: \"helvetica\", arial;\n}\n#perfBar:hover {\n  background: #EFEFEF;\n}\n#perfBar.perfBar-is-active {\n  background: #EFEFEF;\n  height: 250px;\n}\n#perfBar.perfBar-is-active .perfBar-bar:hover {\n  background: #ededed;\n}\n.perfBar-bar {\n  height: 40px;\n  padding: 0 30px;\n  margin: 0 auto;\n  padding-bottom: 10px;\n  padding-top: 10px;\n\n  line-height: 20px;\n  text-align: center;\n  color: #fff;\n  cursor: pointer;\n}\n\n.perfBar-is-active .perfBar-bar {\n  border-bottom: 1px solid #ededed;\n  box-shadow: 0 1px 0 #dedede;\n}\n\n.perfBar-bar-circle {\n  display: inline-block;\n  height: 5px;\n  width: 5px;\n\n  background: #999;\n  border-radius: 50%;\n}\n\n.perfBar-stats {\n  display: none;\n}\n\n\n.perfBar-is-active .perfBar-stats {\n  display: block;\n  overflow: auto;\n  max-height: 200px;\n}\n\n.perfBar-stats ul {\n  list-style: none;\n  padding: 0;\n  margin: 20px auto 0;\n  display: block;\n  width: 90%;\n}\n.perfBar-stats li {\n  padding: 15px;\n  width: 50%;\n  height: 100px;\n  float: left;\n}\n\n.perfBar-stat {\n  text-align: center;  \n}\n.perfBar-valueUnit {\n  -webkit-font-smoothing: antialiased;\n}\n.perfBar-valueUnit.is-good {\n  color: #00AD61;\n}\n.perfBar-valueUnit.is-bad {\n  color: #FF3535;\n}\n.perfBar-value {\n  font-size: 2em;\n  font-weight: 600;\n}\n.perfBar-unit {\n  font-size: 1.2em;\n  font-weight: 500;\n}\n.perfBar-label {\n  margin-top: 5px;\n\n  color: #999;\n  font-weight: 200;\n  font-size: .8em;\n}\n\n.perfBar-cf:before,\n.perfBar-cf:after {\n    content: \" \"; /* 1 */\n    display: table; /* 2 */\n}\n\n.perfBar-cf:after {\n    clear: both;\n}\n\n/**\n * For IE 6/7 only\n * Include this rule to trigger hasLayout and contain floats.\n */\n.perfBar-cf {\n    *zoom: 1;\n}\n\n\n@media screen and (min-width: 700px) {\n  .perfBar-stats li {\n    width: 20%;\n  }\n}\n</style>\n<div id=\"perfBar\">\n  <div class=\"perfBar-bar\">\n    <span class=\"perfBar-bar-circle\"></span>\n    <span class=\"perfBar-bar-circle\"></span>\n    <span class=\"perfBar-bar-circle\"></span>\n  </div>\n  <div class=\"perfBar-stats\">\n    <ul class=\"perfBar-cf\">\n    </ul>\n  </div>\n</div>";
  },"useData":true});

},{"hbsfy/runtime":12}],4:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"1":function(depth0,helpers,partials,data) {
  return " is-good ";
  },"3":function(depth0,helpers,partials,data) {
  return " is-bad ";
  },"5":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "      <abbr title=\""
    + escapeExpression(((helper = (helper = helpers.hint || (depth0 != null ? depth0.hint : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"hint","hash":{},"data":data}) : helper)))
    + "\">\n        <span class=\"perfBar-value\">"
    + escapeExpression(((helper = (helper = helpers.value || (depth0 != null ? depth0.value : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"value","hash":{},"data":data}) : helper)))
    + "</span>\n        <span class=\"perfBar-unit\">"
    + escapeExpression(((helper = (helper = helpers.unit || (depth0 != null ? depth0.unit : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"unit","hash":{},"data":data}) : helper)))
    + "</span>\n      </abbr>\n";
},"7":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "        <span class=\"perfBar-value\">"
    + escapeExpression(((helper = (helper = helpers.value || (depth0 != null ? depth0.value : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"value","hash":{},"data":data}) : helper)))
    + "</span>\n        <span class=\"perfBar-unit\">"
    + escapeExpression(((helper = (helper = helpers.unit || (depth0 != null ? depth0.unit : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"unit","hash":{},"data":data}) : helper)))
    + "</span>\n";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "<li id=\"perfBar-metric-"
    + escapeExpression(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"id","hash":{},"data":data}) : helper)))
    + "\">\n  <div class=\"perfBar-stat\">\n    <div class=\"perfBar-valueUnit ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.isGood : depth0), {"name":"if","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += " ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.isBad : depth0), {"name":"if","hash":{},"fn":this.program(3, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\">\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.hint : depth0), {"name":"if","hash":{},"fn":this.program(5, data),"inverse":this.program(7, data),"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "    </div>\n    <h3 class=\"perfBar-label\">"
    + escapeExpression(((helper = (helper = helpers.label || (depth0 != null ? depth0.label : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"label","hash":{},"data":data}) : helper)))
    + "</h3>\n  </div>\n</li>";
},"useData":true});

},{"hbsfy/runtime":12}],5:[function(require,module,exports){
"use strict";
/*globals Handlebars: true */
var base = require("./handlebars/base");

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between commonjs and browse envs)
var SafeString = require("./handlebars/safe-string")["default"];
var Exception = require("./handlebars/exception")["default"];
var Utils = require("./handlebars/utils");
var runtime = require("./handlebars/runtime");

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
var create = function() {
  var hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = SafeString;
  hb.Exception = Exception;
  hb.Utils = Utils;
  hb.escapeExpression = Utils.escapeExpression;

  hb.VM = runtime;
  hb.template = function(spec) {
    return runtime.template(spec, hb);
  };

  return hb;
};

var Handlebars = create();
Handlebars.create = create;

Handlebars['default'] = Handlebars;

exports["default"] = Handlebars;
},{"./handlebars/base":6,"./handlebars/exception":7,"./handlebars/runtime":8,"./handlebars/safe-string":9,"./handlebars/utils":10}],6:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];

var VERSION = "2.0.0";
exports.VERSION = VERSION;var COMPILER_REVISION = 6;
exports.COMPILER_REVISION = COMPILER_REVISION;
var REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '== 1.x.x',
  5: '== 2.0.0-alpha.x',
  6: '>= 2.0.0-beta.1'
};
exports.REVISION_CHANGES = REVISION_CHANGES;
var isArray = Utils.isArray,
    isFunction = Utils.isFunction,
    toString = Utils.toString,
    objectType = '[object Object]';

function HandlebarsEnvironment(helpers, partials) {
  this.helpers = helpers || {};
  this.partials = partials || {};

  registerDefaultHelpers(this);
}

exports.HandlebarsEnvironment = HandlebarsEnvironment;HandlebarsEnvironment.prototype = {
  constructor: HandlebarsEnvironment,

  logger: logger,
  log: log,

  registerHelper: function(name, fn) {
    if (toString.call(name) === objectType) {
      if (fn) { throw new Exception('Arg not supported with multiple helpers'); }
      Utils.extend(this.helpers, name);
    } else {
      this.helpers[name] = fn;
    }
  },
  unregisterHelper: function(name) {
    delete this.helpers[name];
  },

  registerPartial: function(name, partial) {
    if (toString.call(name) === objectType) {
      Utils.extend(this.partials,  name);
    } else {
      this.partials[name] = partial;
    }
  },
  unregisterPartial: function(name) {
    delete this.partials[name];
  }
};

function registerDefaultHelpers(instance) {
  instance.registerHelper('helperMissing', function(/* [args, ]options */) {
    if(arguments.length === 1) {
      // A missing field in a {{foo}} constuct.
      return undefined;
    } else {
      // Someone is actually trying to call something, blow up.
      throw new Exception("Missing helper: '" + arguments[arguments.length-1].name + "'");
    }
  });

  instance.registerHelper('blockHelperMissing', function(context, options) {
    var inverse = options.inverse,
        fn = options.fn;

    if(context === true) {
      return fn(this);
    } else if(context === false || context == null) {
      return inverse(this);
    } else if (isArray(context)) {
      if(context.length > 0) {
        if (options.ids) {
          options.ids = [options.name];
        }

        return instance.helpers.each(context, options);
      } else {
        return inverse(this);
      }
    } else {
      if (options.data && options.ids) {
        var data = createFrame(options.data);
        data.contextPath = Utils.appendContextPath(options.data.contextPath, options.name);
        options = {data: data};
      }

      return fn(context, options);
    }
  });

  instance.registerHelper('each', function(context, options) {
    if (!options) {
      throw new Exception('Must pass iterator to #each');
    }

    var fn = options.fn, inverse = options.inverse;
    var i = 0, ret = "", data;

    var contextPath;
    if (options.data && options.ids) {
      contextPath = Utils.appendContextPath(options.data.contextPath, options.ids[0]) + '.';
    }

    if (isFunction(context)) { context = context.call(this); }

    if (options.data) {
      data = createFrame(options.data);
    }

    if(context && typeof context === 'object') {
      if (isArray(context)) {
        for(var j = context.length; i<j; i++) {
          if (data) {
            data.index = i;
            data.first = (i === 0);
            data.last  = (i === (context.length-1));

            if (contextPath) {
              data.contextPath = contextPath + i;
            }
          }
          ret = ret + fn(context[i], { data: data });
        }
      } else {
        for(var key in context) {
          if(context.hasOwnProperty(key)) {
            if(data) {
              data.key = key;
              data.index = i;
              data.first = (i === 0);

              if (contextPath) {
                data.contextPath = contextPath + key;
              }
            }
            ret = ret + fn(context[key], {data: data});
            i++;
          }
        }
      }
    }

    if(i === 0){
      ret = inverse(this);
    }

    return ret;
  });

  instance.registerHelper('if', function(conditional, options) {
    if (isFunction(conditional)) { conditional = conditional.call(this); }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
      return options.inverse(this);
    } else {
      return options.fn(this);
    }
  });

  instance.registerHelper('unless', function(conditional, options) {
    return instance.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn, hash: options.hash});
  });

  instance.registerHelper('with', function(context, options) {
    if (isFunction(context)) { context = context.call(this); }

    var fn = options.fn;

    if (!Utils.isEmpty(context)) {
      if (options.data && options.ids) {
        var data = createFrame(options.data);
        data.contextPath = Utils.appendContextPath(options.data.contextPath, options.ids[0]);
        options = {data:data};
      }

      return fn(context, options);
    } else {
      return options.inverse(this);
    }
  });

  instance.registerHelper('log', function(message, options) {
    var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
    instance.log(level, message);
  });

  instance.registerHelper('lookup', function(obj, field) {
    return obj && obj[field];
  });
}

var logger = {
  methodMap: { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' },

  // State enum
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  level: 3,

  // can be overridden in the host environment
  log: function(level, message) {
    if (logger.level <= level) {
      var method = logger.methodMap[level];
      if (typeof console !== 'undefined' && console[method]) {
        console[method].call(console, message);
      }
    }
  }
};
exports.logger = logger;
var log = logger.log;
exports.log = log;
var createFrame = function(object) {
  var frame = Utils.extend({}, object);
  frame._parent = object;
  return frame;
};
exports.createFrame = createFrame;
},{"./exception":7,"./utils":10}],7:[function(require,module,exports){
"use strict";

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

function Exception(message, node) {
  var line;
  if (node && node.firstLine) {
    line = node.firstLine;

    message += ' - ' + line + ':' + node.firstColumn;
  }

  var tmp = Error.prototype.constructor.call(this, message);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }

  if (line) {
    this.lineNumber = line;
    this.column = node.firstColumn;
  }
}

Exception.prototype = new Error();

exports["default"] = Exception;
},{}],8:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];
var COMPILER_REVISION = require("./base").COMPILER_REVISION;
var REVISION_CHANGES = require("./base").REVISION_CHANGES;
var createFrame = require("./base").createFrame;

function checkRevision(compilerInfo) {
  var compilerRevision = compilerInfo && compilerInfo[0] || 1,
      currentRevision = COMPILER_REVISION;

  if (compilerRevision !== currentRevision) {
    if (compilerRevision < currentRevision) {
      var runtimeVersions = REVISION_CHANGES[currentRevision],
          compilerVersions = REVISION_CHANGES[compilerRevision];
      throw new Exception("Template was precompiled with an older version of Handlebars than the current runtime. "+
            "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").");
    } else {
      // Use the embedded version info since the runtime doesn't know about this revision yet
      throw new Exception("Template was precompiled with a newer version of Handlebars than the current runtime. "+
            "Please update your runtime to a newer version ("+compilerInfo[1]+").");
    }
  }
}

exports.checkRevision = checkRevision;// TODO: Remove this line and break up compilePartial

function template(templateSpec, env) {
  /* istanbul ignore next */
  if (!env) {
    throw new Exception("No environment passed to template");
  }
  if (!templateSpec || !templateSpec.main) {
    throw new Exception('Unknown template object: ' + typeof templateSpec);
  }

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as psuedo-supported APIs.
  env.VM.checkRevision(templateSpec.compiler);

  var invokePartialWrapper = function(partial, indent, name, context, hash, helpers, partials, data, depths) {
    if (hash) {
      context = Utils.extend({}, context, hash);
    }

    var result = env.VM.invokePartial.call(this, partial, name, context, helpers, partials, data, depths);

    if (result == null && env.compile) {
      var options = { helpers: helpers, partials: partials, data: data, depths: depths };
      partials[name] = env.compile(partial, { data: data !== undefined, compat: templateSpec.compat }, env);
      result = partials[name](context, options);
    }
    if (result != null) {
      if (indent) {
        var lines = result.split('\n');
        for (var i = 0, l = lines.length; i < l; i++) {
          if (!lines[i] && i + 1 === l) {
            break;
          }

          lines[i] = indent + lines[i];
        }
        result = lines.join('\n');
      }
      return result;
    } else {
      throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    }
  };

  // Just add water
  var container = {
    lookup: function(depths, name) {
      var len = depths.length;
      for (var i = 0; i < len; i++) {
        if (depths[i] && depths[i][name] != null) {
          return depths[i][name];
        }
      }
    },
    lambda: function(current, context) {
      return typeof current === 'function' ? current.call(context) : current;
    },

    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,

    fn: function(i) {
      return templateSpec[i];
    },

    programs: [],
    program: function(i, data, depths) {
      var programWrapper = this.programs[i],
          fn = this.fn(i);
      if (data || depths) {
        programWrapper = program(this, i, fn, data, depths);
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = program(this, i, fn);
      }
      return programWrapper;
    },

    data: function(data, depth) {
      while (data && depth--) {
        data = data._parent;
      }
      return data;
    },
    merge: function(param, common) {
      var ret = param || common;

      if (param && common && (param !== common)) {
        ret = Utils.extend({}, common, param);
      }

      return ret;
    },

    noop: env.VM.noop,
    compilerInfo: templateSpec.compiler
  };

  var ret = function(context, options) {
    options = options || {};
    var data = options.data;

    ret._setup(options);
    if (!options.partial && templateSpec.useData) {
      data = initData(context, data);
    }
    var depths;
    if (templateSpec.useDepths) {
      depths = options.depths ? [context].concat(options.depths) : [context];
    }

    return templateSpec.main.call(container, context, container.helpers, container.partials, data, depths);
  };
  ret.isTop = true;

  ret._setup = function(options) {
    if (!options.partial) {
      container.helpers = container.merge(options.helpers, env.helpers);

      if (templateSpec.usePartial) {
        container.partials = container.merge(options.partials, env.partials);
      }
    } else {
      container.helpers = options.helpers;
      container.partials = options.partials;
    }
  };

  ret._child = function(i, data, depths) {
    if (templateSpec.useDepths && !depths) {
      throw new Exception('must pass parent depths');
    }

    return program(container, i, templateSpec[i], data, depths);
  };
  return ret;
}

exports.template = template;function program(container, i, fn, data, depths) {
  var prog = function(context, options) {
    options = options || {};

    return fn.call(container, context, container.helpers, container.partials, options.data || data, depths && [context].concat(depths));
  };
  prog.program = i;
  prog.depth = depths ? depths.length : 0;
  return prog;
}

exports.program = program;function invokePartial(partial, name, context, helpers, partials, data, depths) {
  var options = { partial: true, helpers: helpers, partials: partials, data: data, depths: depths };

  if(partial === undefined) {
    throw new Exception("The partial " + name + " could not be found");
  } else if(partial instanceof Function) {
    return partial(context, options);
  }
}

exports.invokePartial = invokePartial;function noop() { return ""; }

exports.noop = noop;function initData(context, data) {
  if (!data || !('root' in data)) {
    data = data ? createFrame(data) : {};
    data.root = context;
  }
  return data;
}
},{"./base":6,"./exception":7,"./utils":10}],9:[function(require,module,exports){
"use strict";
// Build out our basic SafeString type
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = function() {
  return "" + this.string;
};

exports["default"] = SafeString;
},{}],10:[function(require,module,exports){
"use strict";
/*jshint -W004 */
var SafeString = require("./safe-string")["default"];

var escape = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};

var badChars = /[&<>"'`]/g;
var possible = /[&<>"'`]/;

function escapeChar(chr) {
  return escape[chr];
}

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

exports.extend = extend;var toString = Object.prototype.toString;
exports.toString = toString;
// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
var isFunction = function(value) {
  return typeof value === 'function';
};
// fallback for older versions of Chrome and Safari
/* istanbul ignore next */
if (isFunction(/x/)) {
  isFunction = function(value) {
    return typeof value === 'function' && toString.call(value) === '[object Function]';
  };
}
var isFunction;
exports.isFunction = isFunction;
/* istanbul ignore next */
var isArray = Array.isArray || function(value) {
  return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
};
exports.isArray = isArray;

function escapeExpression(string) {
  // don't escape SafeStrings, since they're already safe
  if (string instanceof SafeString) {
    return string.toString();
  } else if (string == null) {
    return "";
  } else if (!string) {
    return string + '';
  }

  // Force a string conversion as this will be done by the append regardless and
  // the regex test will do this transparently behind the scenes, causing issues if
  // an object's to string has escaped characters in it.
  string = "" + string;

  if(!possible.test(string)) { return string; }
  return string.replace(badChars, escapeChar);
}

exports.escapeExpression = escapeExpression;function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}

exports.isEmpty = isEmpty;function appendContextPath(contextPath, id) {
  return (contextPath ? contextPath + '.' : '') + id;
}

exports.appendContextPath = appendContextPath;
},{"./safe-string":9}],11:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime');

},{"./dist/cjs/handlebars.runtime":5}],12:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":11}]},{},[2]);


/*
 *  perfBarAddons, made to add a shared, s3-hosted budget json file, configurable pagetypes, connections to perfbar
 */

// TODO: close the scope of this module off with a closure?
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
