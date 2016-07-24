#!/usr/local/bin/node

var argv = require('yargs')
  .usage('Usage: $0 <filename>')
  .demand(1, 1, 'Please specify a file to open.')
  .argv;
var ffmpeg = require('fluent-ffmpeg');
var concat = require('concat-stream')
var imgcat = require('term-img2');
var blessed = require('blessed');
var beep = require('beeper');
var path = require('path');

var videoFile = argv._[0];
var info = {
  currentFrame: 1,
  inPoint: undefined,
  outPoint: undefined
}

var screen = blessed.screen({
  ignoreLocked: ['escape', 'q', 'C-c']
});
screen.title = 'itrim';

var box = blessed.terminal({
  parent: screen,
  left: 0,
  top: 0,
  height: '100%',
  width: '70%',
  handler: function() {}
});

var infoBox = blessed.box({
  parent: screen,
  right: 0,
  top: 0,
  height: '100%',
  width: '30%',
  border: 'line',
  tags: true,
  label: 'Info'
});

var keyInfo = 'Keys:\n';
keyInfo += '[/]: -/+ 1 frame\n';
keyInfo += '←/→: -/+ 10 frames\n';
keyInfo += 'j/l: -/+ 100 frames\n';
keyInfo += 'i: Set in point\n';
keyInfo += 'o: Set out point\n';
keyInfo += 'Enter: Save file\n';
keyInfo += 'q: Exit';

var keys = blessed.text({
  parent: infoBox,
  bottom: 0,
  content: keyInfo
});
updateInfoBox();

screen.key('j', frameChangeFunc(-100));
screen.key('l', frameChangeFunc(100));

screen.key('left', frameChangeFunc(-10));
screen.key('right', frameChangeFunc(10));

screen.key('[', frameChangeFunc(-1));
screen.key(']', frameChangeFunc(1));

screen.key(['i', 'o'], function(ch, key) {
  if (key.name === 'i') {
    info.inPoint = info.currentFrame;
  } else if (key.name === 'o') {
    info.outPoint = info.currentFrame;
  }
  updateInfoBox();
});

screen.key(['enter'], function() {
  if (typeof info.inPoint === 'undefined' || typeof info.outPoint === 'undefined') {
    displayError('In and out points must both be set.')
  } else if (info.inPoint === info.outPoint) {
    displayError('In and out points cannot be the same.')
  } else {
    var filenamePrompt = blessed.prompt({
      parent: screen,
      left: 'center',
      top: 'center',
      align: 'center',
      shrink: true,
      padding: {
        left: 5,
        right: 5
      },
      border: 'line'
    });

    var defaultTrimmedFileName = path.join(
      path.dirname(videoFile),
      path.basename(videoFile, path.extname(videoFile)) + '-trimmed' + path.extname(videoFile)
    );

    screen.realloc();

    filenamePrompt.input('What should the trimmed file be saved as?', defaultTrimmedFileName, function(err, filename) {
      if (filename !== null && filename !== '') {
        /*
          I've experienced quite a bit of difficulty trying to get audio to work with this, so for now I've disabled it.
          The problem essentially boils down to the fact that the ffmpeg aselect filter deals in audio sample numbers, not
          frame numbers. One should be able to calculate frame numbers from the audio framerate returned by ffprobe, but at least
          for my test video it's being returned at 0/0.
        
          I left some of my attempts as reference; anyone who thinks they can figure it out is greatly encouraged to do so!
        */

        ffmpeg(videoFile)
          .noAudio()
          .videoFilters('select=\'between(n,' + (info.inPoint - 1) + ',' + (info.outPoint - 1) + ')\',setpts=\'N/FRAME_RATE/TB\'')
        //.audioFilters('aselect=\'between(n,' + (info.inPoint - 1) + ',' + (info.outPoint - 1) + ')\',asetpts=\'N/SR/TB\'')
        //.audioFilters('aselect=between(n,' + info.inPoint + ',' + info.outPoint + '),asetpts=N/SR/TB')
        //.audioFilters('aselect=gte(n\\,' + info.inPoint + ')')
        //.videoFilters('trim=start_frame=' + info.inPoint + ':end_frame=' + (info.outPoint + 1))
        .on('end', function() {
          screen.destroy();
          console.log('Saved to ' + filename + '!');
        })
          .on('error', function(err) {
            displayError('Error trimming video: ' + err, true);
          })
          .save(filename);
      } else if (filename === '') {
        displayError('Filename cannot be blank.')
      } else if (err) {
        displayError(err);
      } else {
        displayCurrentFrame();
      }
    })
  }
});

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

screen.on('resize', function() {
  displayCurrentFrame();
})

getVideoData();

function displayCurrentFrame() {
  getFrame(info.currentFrame - 1, function(frame) {
    var ansi = imgcat(frame, {
      log: false,
      height: box.height,
      width: box.width
    });
    ansi = ansi.replace('\n', '');
    ansi = ansi.replace('\033', '\033Ptmux;\033\033') + '\033\\';
    screen.realloc();
    box.term.reset();
    box.term.write(ansi);
    box.term.cursorHidden = true;
    screen.render();
  })
}

function frameChangeFunc(diff) {
  return function() {
    var changed = info.currentFrame + diff;
    var underFrameCount = typeof info.frameCount !== 'undefined' ? changed <= info.frameCount : true;
    if (changed >= 0) {
      if (changed === 0) {
        info.currentFrame = 1;
      } else if (!underFrameCount) {
        info.currentFrame = info.frameCount;
      } else {
        info.currentFrame = changed;
      }
      updateInfoBox();
      displayCurrentFrame();
    } else {
      beep();
    }
  }
}

function updateInfoBox() {
  var content = '';

  if (typeof info.frameCount !== 'undefined') {
    content += '{bold}Frame:{/bold} ' + info.currentFrame + '/' + info.frameCount;
  } else {
    content += '{bold}Frame:{/bold} ' + info.currentFrame;
  }
  content += '\n';

  if (typeof info.inPoint !== 'undefined') {
    content += '{bold}In:{/bold} ' + info.inPoint;
  } else {
    content += '{bold}In:{/bold} (none set)';
  }
  content += '\n';

  if (typeof info.outPoint !== 'undefined') {
    content += '{bold}Out:{/bold} ' + info.outPoint;
  } else {
    content += '{bold}Out:{/bold} (none set)';
  }
  content += '\n';

  infoBox.setContent(content);
}

function getFrame(frameNumber, cb) {
  var stream = concat(function(frame) {
    cb(frame);
  });

  var command = ffmpeg(videoFile)
    .videoFilters('select=gte(n\\,' + frameNumber + ')')
    .frames(1)
    .size('480x?')
    .format('singlejpeg')
    .on('error', function(err) {
      displayError('Error getting frame ' + frameNumber + ': ' + err);
    })
    .pipe(stream, {
      end: true
    });
}

function getVideoData() {
  var command = ffmpeg.ffprobe(videoFile, function(err, data) {
    if (!err) {
      var videoStream = data.streams.find(function(stream) {
        return stream.codec_type === 'video'
      });

      if (typeof videoStream !== 'undefined') {
        info.frameCount = videoStream.nb_frames;
        updateInfoBox();
        displayCurrentFrame();
      } else {
        displayError('No video stream found in file', true);
      }
    } else {
      displayError('Error reading file. Is the file is a valid video?', true);
    }
  })
}

function displayError(err, fatal) {
  var errorBox = blessed.message({
    parent: screen,
    left: 'center',
    top: 'center',
    align: 'center',
    shrink: true,
    padding: {
      left: 5,
      right: 5
    },
    border: {
      type: 'line',
      fg: 'red'
    },
    bold: true,
    label: '{red-fg}Error{/}'
  });

  screen.realloc();
  screen.grabKeys = true;
  if (fatal === true) {
    errorBox.error(err, function() {
      screen.destroy();
      console.error('Fatal error: ' + err);
      process.exit(1);
    });
  } else {
    errorBox.error(err, function() {
      screen.grabKeys = false;
      displayCurrentFrame();
      errorBox.destroy();
    });
  }
}
