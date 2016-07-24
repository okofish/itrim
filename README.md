# itrim

![iTrim screenshot](/screenshot.png)

itrim is an interactive command-line video trimming tool for iTerm 2. It displays video frames using iTerm's [custom image ANSI escape codes](https://www.iterm2.com/documentation-images.html).

## Use

Install itrim with `npm install -g itrim` and run it with `itrim <video file>`, or clone the repository and run `./index.js test.mp4`.

## TODO

- [ ] Add audio support
- [ ] Improve support for non-MPEG-4 video formats
- [x] Modify ffmpeg command to reduce the dimension of video frames, so iTerm doesn't lag with giant images
- [ ] Map `g` key to a "goto frame" dialog for quickly jumping around the file