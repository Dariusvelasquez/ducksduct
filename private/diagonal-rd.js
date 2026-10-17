/* Example job recreated from a hand sketch ('After' layout). Coordinates are feet, converted from the sketch at an assumed ~11.7 px/ft. */
window.EXAMPLES = Object.assign(window.EXAMPLES || {}, { demo: {
 "address": "8455 Diagonal Rd, St. Petersburg, FL",
 "parcel": "17-30-30-75672-027-0010",
 "footprint": [
  {
   "x": 0.0,
   "y": 0.0
  },
  {
   "x": 27.0,
   "y": 0.0
  },
  {
   "x": 27.0,
   "y": 34.5
  },
  {
   "x": 0.0,
   "y": 34.5
  }
 ],
 "rooms": [
  {
   "k": "drop",
   "name": "Drop ceiling",
   "x": 0.0,
   "y": 0.0,
   "w": 13.0,
   "h": 11.5,
   "noAC": true
  },
  {
   "k": "unl",
   "name": "Unlabeled (confirm)",
   "x": 13.0,
   "y": 0.0,
   "w": 14.0,
   "h": 10.5,
   "noAC": true
  },
  {
   "k": "bath",
   "name": "Bath / hall",
   "x": 0.0,
   "y": 11.5,
   "w": 13.0,
   "h": 9.5
  },
  {
   "k": "kit",
   "name": "Kitchen",
   "x": 13.0,
   "y": 10.5,
   "w": 14.0,
   "h": 10.5
  },
  {
   "k": "main",
   "name": "Main area",
   "x": 0.0,
   "y": 21.0,
   "w": 27.0,
   "h": 13.5
  }
 ],
 "walls": [
  {
   "x1": 0.0,
   "y1": 11.5,
   "x2": 11.5,
   "y2": 11.5,
   "removed": false
  },
  {
   "x1": 13.0,
   "y1": 0.0,
   "x2": 13.0,
   "y2": 10.5,
   "removed": false
  },
  {
   "x1": 19.0,
   "y1": 21.0,
   "x2": 24.0,
   "y2": 21.0,
   "removed": false
  },
  {
   "x1": 23.0,
   "y1": 12.0,
   "x2": 27.0,
   "y2": 12.0,
   "removed": true
  }
 ],
 "equip": [
  {
   "k": "ah",
   "type": "ahu",
   "x": 7.5,
   "y": 25.0,
   "label": "A/H",
   "tons": 2
  },
  {
   "k": "cond",
   "type": "condenser",
   "x": -4.5,
   "y": 30.5,
   "label": "CONDENSER",
   "tons": 2
  },
  {
   "k": "pl",
   "type": "splitter",
   "x": 19.0,
   "y": 25.0
  },
  {
   "k": "pl2",
   "type": "splitter",
   "x": 11.5,
   "y": 20.5
  },
  {
   "k": "scut",
   "type": "scuttle",
   "x": 8.5,
   "y": 22.0
  },
  {
   "k": "s1",
   "type": "supply",
   "x": 7.0,
   "y": 14.0,
   "weight": 1
  },
  {
   "k": "s2",
   "type": "supply",
   "x": 11.0,
   "y": 15.5,
   "weight": 0.45
  },
  {
   "k": "s3",
   "type": "supply",
   "x": 18.0,
   "y": 19.5,
   "weight": 1
  },
  {
   "k": "s4",
   "type": "supply",
   "x": 21.0,
   "y": 13.0,
   "weight": 1
  },
  {
   "k": "s5",
   "type": "supply",
   "x": 21.5,
   "y": 22.5,
   "weight": 1.36
  },
  {
   "k": "s6",
   "type": "supply",
   "x": 8.5,
   "y": 28.0,
   "weight": 1
  },
  {
   "k": "r1",
   "type": "return",
   "x": 10.5,
   "y": 18.5,
   "size": "20x20"
  },
  {
   "k": "r2",
   "type": "return",
   "x": 15.0,
   "y": 11.0,
   "size": "20x20",
   "label": "unducted in sketch"
  },
  {
   "k": "n1",
   "type": "note",
   "x": 10.5,
   "y": 36.5,
   "label": "FRONT DOOR"
  }
 ],
 "ducts": [
  {
   "kind": "refrig",
   "a": "cond",
   "b": "ah"
  },
  {
   "kind": "supply",
   "a": "ah",
   "b": "pl",
   "dia": 12
  },
  {
   "kind": "supply",
   "a": "pl",
   "b": "s3",
   "dia": 6
  },
  {
   "kind": "supply",
   "a": "pl",
   "b": "s4",
   "dia": 6
  },
  {
   "kind": "supply",
   "a": "pl",
   "b": "s5",
   "dia": 7
  },
  {
   "kind": "supply",
   "a": "ah",
   "b": "s6",
   "dia": 6
  },
  {
   "kind": "supply",
   "a": "ah",
   "b": "pl2",
   "dia": 7
  },
  {
   "kind": "supply",
   "a": "pl2",
   "b": "s1",
   "dia": 6
  },
  {
   "kind": "supply",
   "a": "pl2",
   "b": "s2",
   "dia": 4
  },
  {
   "kind": "return",
   "a": "r1",
   "b": "ah",
   "dia": 14,
   "flex": true
  }
 ]
} });
