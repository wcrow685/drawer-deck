// Drawer Deck stand: iPod touch 4th gen, landscape, with a 30-pin charging plug.
// Home button on the right, so the dock connector faces right and the plug sits
// in the right-hand tower. Slide the iPod rightwards onto the plug.
// Prints flat on its base, no supports. All sizes in mm.

/* [iPod touch 4] */
ipod_len   = 111.0;  // long edge (horizontal in landscape)
ipod_h     = 58.9;   // short edge (vertical in landscape)
ipod_t     = 7.2;    // thickness
fit        = 0.6;    // total play in the slot

// Volume buttons end up on the bottom edge in this orientation.
vol_from   = 9;      // from the left end of the iPod
vol_to     = 38;

/* [30-pin plug] */
plug_w     = 21.3;   // plastic body, along the iPod's short edge
plug_t     = 5.4;    // plastic body thickness
plug_len   = 13.0;   // plastic body length (without the metal tongue)
plug_y     = 3.6;    // body centre measured from the iPod's screen face
relief_d   = 4.8;    // strain relief diameter
relief_len = 9;
cable_d    = 3.6;
plug_clr   = 0.3;    // per side

/* [Stand] */
tilt       = 18;     // lean back from vertical, degrees
back_h     = 42;     // backrest height above the ledge
wall       = 3.2;
ledge_t    = 4;      // ledge thickness under the iPod
lip_h      = 3.0;    // front lip; screen starts ~4.8 mm in, so keep below that
lip_t      = 2.4;
lift       = 6;      // ledge underside height above the desk
left_margin = 3;     // ledge beyond the iPod's left end
tower_extra = 6;     // tower length beyond the strain relief
rear_foot  = 14;     // base depth behind the backrest
base_t     = 3;

/* [Desk fixing] */
pad_d      = 12.5;   // stick-on rubber feet
pad_depth  = 1.0;
weight_l   = 40;     // open-bottom pockets for coins / steel nuts, behind the slot
weight_h   = 6;

$fn = 48;
eps = 0.01;

slot_t   = ipod_t + fit;
tower_x0 = ipod_len + fit / 2;                 // tower face the iPod edge touches
tower_x1 = tower_x0 + plug_len + relief_len + tower_extra;
x0       = -left_margin;
yb       = slot_t + wall;                      // backrest rear face (device frame)

// ---- device frame: x along iPod, y backwards from the screen face, z up from ledge ----
// Tilt leans the top back and lifts the cradle onto its supports.
module place() {
  translate([0, 0, lift + ledge_t * cos(tilt)])
    rotate([-tilt, 0, 0]) children();
}
// where a device-frame point lands, for sizing the supports
function py(y, z) = y * cos(tilt) + z * sin(tilt);
function pz(y, z) = lift + ledge_t * cos(tilt) - y * sin(tilt) + z * cos(tilt);

module ledge()    translate([x0, -lip_t, -ledge_t]) cube([tower_x1 - x0, yb + lip_t, ledge_t]);
module lip()      translate([x0, -lip_t, -eps])     cube([tower_x0 - x0, lip_t, lip_h]);
module backrest() translate([x0, slot_t, -ledge_t]) cube([tower_x1 - x0, wall, back_h + ledge_t]);

// Tower to the right of the iPod, holding the plug at the connector's height.
tower_top = ipod_h / 2 + plug_w / 2 + 3;
module tower()    translate([tower_x0, -lip_t, -ledge_t]) cube([tower_x1 - tower_x0, yb + lip_t, tower_top + ledge_t]);

module plug_cut() {
  zc = ipod_h / 2;
  // plug body, open to the top so the cable drops in
  translate([tower_x0 - eps, plug_y - plug_t / 2 - plug_clr, zc - plug_w / 2 - plug_clr])
    cube([plug_len + plug_clr + eps, plug_t + 2 * plug_clr, tower_top]);
  // strain relief channel to the outer face, also open to the top
  translate([tower_x0 + plug_len, plug_y - relief_d / 2 - plug_clr, zc - relief_d / 2 - plug_clr])
    cube([tower_x1 - tower_x0, relief_d + 2 * plug_clr, tower_top]);
}

module vol_relief() translate([vol_from, -eps, -1.6]) cube([vol_to - vol_from, slot_t + eps, 1.6 + eps]);

// ---- supports: hull each part down to a slab on the desk, never across the slot ----
y_front  = py(-lip_t, -ledge_t) - 1;
y_back_f = py(slot_t, -ledge_t);
y_rear   = max(py(yb, back_h), py(yb, -ledge_t)) + rear_foot;
module slab(y0, x1 = tower_x1) translate([x0, y0, 0]) cube([x1 - x0, y_rear - y0, base_t]);

module body() {
  hull() { place() ledge(); slab(y_front); }
  hull() { place() backrest(); slab(y_back_f); }
  hull() { place() tower(); translate([tower_x0, y_front, 0]) cube([tower_x1 - tower_x0, y_rear - y_front, base_t]); }
  place() lip();
}

// Cable path from the strain relief channel: down the outer face, then under the base to the back.
module cable_path() {
  zc = pz(plug_y, ipod_h / 2);
  yc = py(plug_y, ipod_h / 2);
  // vertical groove in the tower's outer face
  translate([tower_x1 - cable_d - 1.5, yc - cable_d / 2, -eps]) cube([cable_d + 1.5 + eps, cable_d, zc + 1]);
  // channel under the base to the rear edge
  translate([tower_x1 - cable_d - 1.5, yc - cable_d / 2, -eps]) cube([cable_d, y_rear - yc + cable_d, cable_d + 0.4]);
}

module desk_fixing() {
  // Weight pockets live in the solid wedge behind the backrest. Further forward
  // they would break into the slot, whose floor is only ~7 mm above the desk.
  wy0 = py(yb, 0) + 1;
  wy1 = y_rear - 3.5;
  for (cx = [ipod_len * 0.32, ipod_len * 0.70])
    translate([cx - weight_l / 2, wy0, -eps]) cube([weight_l, wy1 - wy0, weight_h]);
  // rubber feet in the corners
  for (x = [x0 + pad_d / 2 + 2, tower_x1 - pad_d / 2 - 8], y = [y_front + pad_d / 2 + 2, y_rear - pad_d / 2 - 2])
    translate([x, y, -eps]) cylinder(d = pad_d + 0.4, h = pad_depth + eps);
}

difference() {
  body();
  place() { plug_cut(); vol_relief(); }
  // the slot itself, in case a hull grazed it
  place() translate([x0 - 1, 0, 0]) cube([tower_x0 - x0 + 1, slot_t, back_h + 20]);
  cable_path();
  desk_fixing();
}

// Ghost iPod for checking the fit in the OpenSCAD preview (F5 only).
%place() translate([fit / 2, fit / 2, 0]) cube([ipod_len, ipod_t, ipod_h]);
