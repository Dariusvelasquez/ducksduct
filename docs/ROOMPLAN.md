# LiDAR room scan (Apple RoomPlan)

**Status: file import is built and unit tested with made-up files. The iPhone/iPad scanning app is NOT built, and the import has not been tried on a real RoomPlan file.**

A web page cannot use the LiDAR scanner. RoomPlan only runs inside a native iOS app, on an iPhone or iPad Pro with LiDAR (iOS 16 or later).

## What exists
Setup > Room scan > **Import scan file** reads a `.json` file and adds the walls to the plan, moved to the top-left of the footprint and in feet. Two shapes are accepted (see the header of `roomplan.js`):
1. `{ "units": "m", "walls": [ { "x1":0, "y1":0, "x2":4, "y2":0 } ] }`
2. A RoomPlan `CapturedRoom` encoded with Swift's `JSONEncoder` (walls with `dimensions` and a 4x4 `transform`). The exact encoding was not checked against a real scan, so use shape 1 as the dependable contract.
Doors and windows in the file are counted but not imported. The user is told to check the walls against the room.

## What is needed
A small SwiftUI app: `RoomCaptureView` to scan, then save or share the `CapturedRoom` as JSON (or convert walls to shape 1). Roughly a few days for someone who knows iOS, plus an Apple developer account ($99/year) to put it on devices. Android has no equivalent of RoomPlan; ARCore depth does not give comparable room models.
Hide the panel with `features.scan: false`.
