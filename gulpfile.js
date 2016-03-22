var gulp      = require('gulp');
var minifyCSS = require('gulp-minify-css');
var stylus    = require('gulp-stylus');
var csso      = require('gulp-csso');
var path      = require('path');
var concat    = require('gulp-concat');
var uglify    = require('gulp-uglify');
var browserSync = require('browser-sync').create();

// CONFIG
var paths = {
  perfbar: ['./src/rum-speedindex.js','./src/perfbar.js','./src/perfbar-addons.js'],
  justice: ['./src/justice.min.js','./src/justice-addons.js'],
  css: ['./src/perfbar.styl', './src/perfbar-mini.styl'],
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
gulp.task('justice', function(){
  gulp.src(paths.justice)
    .pipe(concat('justice.min.js'))
    // .pipe(uglify())
    .pipe(gulp.dest(paths.dest));
});

gulp.task('css', function(){
  gulp.src(paths.css)
    .pipe(stylus())
    // .pipe(csso())
    .pipe(gulp.dest(paths.dest))
    .pipe(browserSync.stream());
})

// STATIC SERVER
gulp.task('browser-sync', function() {
  browserSync.init({
    server: {
      baseDir: "./"
    }
  });
});

gulp.task('js', ['perfbar', 'justice']);

gulp.task('js-watch', ['js']);

// BUILD
gulp.task('build', ['js','css']);

// WATCH
gulp.task('watch', function(){
  gulp.watch([paths.perfbar, paths.justice], ['js-watch']);
  gulp.watch(paths.destJS).on('change', browserSync.reload);
  gulp.watch(paths.css, ['css']);
  gulp.watch('./test/*.html').on('change', browserSync.reload);
});

// DEFAULT
gulp.task('default', ['build', 'watch', 'browser-sync']);

