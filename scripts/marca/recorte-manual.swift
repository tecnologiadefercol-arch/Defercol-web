// Renderiza una zona de una página del manual de marca (vectorial) a PNG.
//
//   swift scripts/marca/recorte-manual.swift <pdf> <página 1..n> <x> <y> <ancho> <alto> <escala> <salida.png>
//
// x, y, ancho y alto en puntos PDF medidos desde la esquina superior izquierda.
// El fondo queda transparente salvo lo que la propia página pinte en esa zona.
// Se usa para sacar el símbolo reducido (favicon) y el símbolo en negativo
// (íconos de app) tal como vienen en el manual, sin redibujarlos.
import AppKit
import PDFKit

let a = CommandLine.arguments
guard a.count == 9, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])),
      let page = doc.page(at: Int(a[2])! - 1) else {
  FileHandle.standardError.write("uso: recorte-manual.swift pdf página x y ancho alto escala salida\n".data(using: .utf8)!)
  exit(1)
}
let x = CGFloat(Double(a[3])!), yTop = CGFloat(Double(a[4])!)
let w = CGFloat(Double(a[5])!), h = CGFloat(Double(a[6])!)
let s = CGFloat(Double(a[7])!)
let box = page.bounds(for: .mediaBox)
let pw = Int((w * s).rounded()), ph = Int((h * s).rounded())

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pw, pixelsHigh: ph, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = ctx
let cg = ctx.cgContext
cg.clear(CGRect(x: 0, y: 0, width: pw, height: ph))
cg.scaleBy(x: s, y: s)
// Origen PDF abajo a la izquierda: la zona empieza en (x, alto − yTop − h).
cg.translateBy(x: -x, y: -(box.height - yTop - h))
page.draw(with: .mediaBox, to: cg)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[8]))
print("\(a[8]) \(pw)×\(ph)")
