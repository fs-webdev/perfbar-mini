# perfbar-mini

**A tiny bar that measures page performance live, based on Justice.js**  

## Usage

Include the `dist/perfbar-mini.min.js` file just before the `</body>`.
Then run the `perfBarMini()` function with an optional config:

```html
<script src="../dist/perfbar-mini.min.js"></script>
<script type="text/javascript">
  perfBarMini();
</script>
```

If you need more config, go for it:
```html
<script src="../dist/perfbar-mini.min.js"></script>
<script type="text/javascript">
  perfBarMini({                         // (All configs optional)
    budgets: {}                         // Budgets match schema of https://edge.fscdn.org/assets/budgets/index.html json files
    pageType: 'landing',                // custom default pagetype for budget scenario
    defaultConnection: '3G-mobile',     // custom default connectionType for budget scenario
    gradeGoal: 'D',                     // Minimum Grade goal. If metric goes below this, it will fail. {A,B,C,D}
    justice: {                          // Justice.js options. warnThreshold, showFPS, and chartType are only supported. See: http://okor.github.io/justice/
      // warnThreshold: 0.8,            // threshold to warn before budget metric failure
      showFPS: true,                    // Show Frames Per Second realtime graph
      // chartType: 'spline'            // ChartType for FPS. Not sure of other options currently
    }
  }
);
</script>
```

## Budget Format Example
```json
"cable-desktop": {
   "domInteractive": {
     "A": 500,
     "B": 600,
     "C": 700,
     "D": 800
   },
   "domComplete": {
     "A": 600,
     "B": 700,
     "C": 800,
     "D": 900
   },
   "requests": {
     "A": 5,
     "B": 6,
     "C": 7,
     "D": 8
   },
   "LoadTime": {
     "A": 1000,
     "B": 2000,
     "C": 3000,
     "D": 4000
   },
   "Latency": {
     "A": 100,
     "B": 200,
     "C": 300,
     "D": 400
   },
   "FirstPaint": {
     "A": 800,
     "B": 900,
     "C": 1000,
     "D": 1100
   }
 },
 "3G-mobile": {
   "domInteractive": {
     "A": 500,
     "B": 600,
     "C": 700,
     "D": 800
   },
   "domComplete": {
     "A": 600,
     "B": 700,
     "C": 800,
     "D": 900
   },
   "requests": {
     "A": 5,
     "B": 6,
     "C": 7,
     "D": 8
   },
   "LoadTime": {
     "A": 1000,
     "B": 2000,
     "C": 3000,
     "D": 4000
   },
   "Latency": {
     "A": 100,
     "B": 200,
     "C": 300,
     "D": 400
   },
   "FirstPaint": {
     "A": 800,
     "B": 900,
     "C": 1000,
     "D": 1100
   }
 }
}
```