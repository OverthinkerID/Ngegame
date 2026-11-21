import Foundation
import CoreGraphics

let query = CommandLine.arguments.dropFirst().joined(separator: " ").lowercased()
let normalized = query.replacingOccurrences(of: "—", with: ":")
let tokens = normalized
    .split(separator: ":")
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }

guard !tokens.isEmpty,
      let list = CGWindowListCopyWindowInfo([.excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    exit(0)
}

var bestId: Int? = nil
var bestArea: Double = 0

for win in list {
    let layer = (win[kCGWindowLayer as String] as? Int) ?? -1
    if layer != 0 { continue }
    let owner = (win[kCGWindowOwnerName as String] as? String ?? "").lowercased()
    let name = (win[kCGWindowName as String] as? String ?? "").lowercased()
    guard tokens.contains(where: { owner.contains($0) || name.contains($0) }) else { continue }
    let bounds = win[kCGWindowBounds as String] as? [String: Any]
    let w = (bounds?["Width"] as? Double) ?? 0
    let h = (bounds?["Height"] as? Double) ?? 0
    let area = w * h
    if area < 10000 { continue }
    if area > bestArea, let num = win[kCGWindowNumber as String] as? Int {
        bestArea = area
        bestId = num
    }
}

if let wid = bestId {
    print(wid)
}
