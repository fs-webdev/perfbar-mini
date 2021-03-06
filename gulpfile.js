var gulp        = require('gulp');
var minifyCSS   = require('gulp-minify-css');
var stylus      = require('gulp-stylus');
var csso        = require('gulp-csso');
var path        = require('path');
var concat      = require('gulp-concat');
var uglify      = require('gulp-uglify');
var merge       = require('merge');
var browserSync = require('browser-sync').create();
var injectCSS   = require('gulp-css-to-js-style');

// CONFIG
var paths = {
  srcDir: './src',
  perfbar: ['./src/rum-speedindex.js','./src/perfbar.js','./src/perfbar-addons.js'],
  justice: ['./src/justice.min.js','./src/justice-addons.js','./src/justice-styles.js'],
  css: ['./src/perfbar.styl', './src/perfbar-mini.styl', './src/justice-addons.styl'],
  justiceCSS: ['./dist/justice-addons.css'],
  dest: './dist',
  destJS: './dist/**/*.js'
};

// TASKS
gulp.task('perfbar', function(){
  gulp.src(paths.perfbar)
    .pipe(concat('perfbar.js'))
    // .pipe(uglify())
    .pipe(gulp.dest(paths.dest));
});

gulp.task('justice-styles-to-js', function(){
  gulp.src(paths.justiceCSS)
    .pipe(injectCSS())
    .pipe(concat('justice-styles.js'))
    .pipe(gulp.dest(paths.srcDir));
});

gulp.task('justice', ['justice-styles-to-js'], function(){
  var jsStream  = gulp.src(paths.justice)
      .pipe(concat('perfbar-mini.min.js'))
      .pipe(uglify())
      .pipe(gulp.dest(paths.dest));
});

gulp.task('css', function(){
  gulp.src(paths.css)
    .pipe(stylus())
    .pipe(csso())
    .pipe(gulp.dest(paths.dest))
    .pipe(browserSync.stream());
})

// STATIC SERVER
gulp.task('browser-sync', function() {
  browserSync.init({
    server: {
      baseDir: "./"
    },
    startPath: '/test/index.html',
    browser: ['google chrome', 'firefox', 'safari']
  });
});

gulp.task('js', ['perfbar', 'justice']);

gulp.task('js-watch', ['js']);

// BUILD
gulp.task('build', ['css','js']);

// WATCH
gulp.task('watch', function(){
  gulp.watch([paths.perfbar, paths.justice], ['js-watch']);
  gulp.watch(paths.destJS).on('change', browserSync.reload);
  gulp.watch(paths.css, ['css']);
  gulp.watch('./test/*.html').on('change', browserSync.reload);
});

// DEFAULT
gulp.task('default', ['build', 'watch', 'browser-sync']);

