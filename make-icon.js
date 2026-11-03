// Draws the app icon: a dark rounded tile holding a letter D built from six coloured keys.
// Usage: osascript -l JavaScript make-icon.js out.png
ObjC.import('AppKit');

function run(argv) {
  var S = 1024;
  var img = $.NSImage.alloc.initWithSize({ width: S, height: S });
  img.lockFocus;

  function rgb(r, g, b) { return $.NSColor.colorWithSRGBRedGreenBlueAlpha(r / 255, g / 255, b / 255, 1); }

  // macOS icon grid: 824px tile centred in 1024
  rgb(22, 24, 29).setFill;
  $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius({ origin: { x: 100, y: 100 }, size: { width: 824, height: 824 } }, 185, 185).fill;

  // Keys are drawn inset by half the stroke, then filled and stroked with round joins,
  // which rounds every corner, including the sharp ones where a row meets the bowl.
  var STROKE = 48, CX = 462, CY = 512, R = 288;
  var LEFT = 274, STEM_RIGHT = 374, BOWL_LEFT = 598;

  function bowlX(y) { return CX + Math.sqrt(R * R - (y - CY) * (y - CY)); }
  function angle(y) { return Math.asin((y - CY) / R) * 180 / Math.PI; }

  // A key from x0 to the outer curve of the D, between y0 and y1 (y grows upwards).
  function bowlKey(x0, y0, y1, color) {
    var p = $.NSBezierPath.bezierPath;
    p.moveToPoint({ x: x0, y: y1 });
    p.lineToPoint({ x: bowlX(y1), y: y1 });
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise({ x: CX, y: CY }, R, angle(y1), angle(y0), true);
    p.lineToPoint({ x: x0, y: y0 });
    p.closePath;
    paint(p, color);
  }
  function stemKey(y0, y1, color) {
    var p = $.NSBezierPath.bezierPath;
    p.moveToPoint({ x: LEFT, y: y1 });
    p.lineToPoint({ x: STEM_RIGHT, y: y1 });
    p.lineToPoint({ x: STEM_RIGHT, y: y0 });
    p.lineToPoint({ x: LEFT, y: y0 });
    p.closePath;
    paint(p, color);
  }
  function paint(p, color) {
    color.setFill;
    color.setStroke;
    p.lineWidth = STROKE;
    p.lineJoinStyle = $.NSLineJoinStyleRound;
    p.fill;
    p.stroke;
  }

  bowlKey(LEFT, 716, 800, rgb(74, 125, 255));      // top row
  stemKey(552, 636, rgb(52, 199, 89));
  bowlKey(BOWL_LEFT, 552, 636, rgb(255, 196, 0));
  stemKey(388, 472, rgb(175, 82, 222));
  bowlKey(BOWL_LEFT, 388, 472, rgb(90, 200, 250));
  bowlKey(LEFT, 224, 308, rgb(236, 106, 72));      // bottom row

  img.unlockFocus;
  var rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
  var png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  return png.writeToFileAtomically(argv[0], true);
}
