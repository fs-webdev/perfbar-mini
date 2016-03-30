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