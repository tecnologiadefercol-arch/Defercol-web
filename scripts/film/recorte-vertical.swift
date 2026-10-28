// Recorte vertical de un clip del film del inicio, para teléfonos en vertical.
//
//   swiftc -O -o /tmp/recorte-vertical scripts/film/recorte-vertical.swift
//   cd public/videos/catalogo
//   /tmp/recorte-vertical clip-1.mp4 clip-1-v.mp4 58 50 3000000
//   /tmp/recorte-vertical clip-2.mp4 clip-2-v.mp4 50 50 3000000
//   /tmp/recorte-vertical clip-3.mp4 clip-3-v.mp4 50 55 3000000
//   /tmp/recorte-vertical clip-4.mp4 clip-4-v.mp4 55 50 3000000
//
// Argumentos: <entrada 1920×1080> <salida> <focoX inicio %> <focoX fin %> <bitrate bps>.
// Los focos son la x del `focus` de las dos paradas que une el clip (stops en
// src/components/CatalogFilm.astro): si cambian, hay que regenerar.
//
// La ventana de 608×1080 se desplaza en el tiempo del foco inicial al final
// (como lerpFocus en la página) y se centra donde la página centra la foto en
// una pantalla 1:2, para que los cuadros extremos coincidan con las fotos de
// parada. Se copian los planos YUV tal cual (sin conversión de color). H.264
// High, sin cuadros B, cuadro clave cada 12, moov al inicio. AVAssetWriter deja
// junto a la salida una copia intermedia `*.sb-*` sin optimizar: se puede borrar.
import AVFoundation
import Foundation

let a = CommandLine.arguments
let src = URL(fileURLWithPath: a[1]), dst = URL(fileURLWithPath: a[2])
let fx0 = Double(a[3])! / 100, fx1 = Double(a[4])! / 100, bitrate = Int(a[5])!
let W = 608, H = 1080, wRef = 540.0 // ancho visible de la foto (px de origen) en una pantalla 1:2

let asset = AVURLAsset(url: src)
let track = asset.tracks(withMediaType: .video)[0]
let srcW = Int(track.naturalSize.width)
let total = Int((CMTimeGetSeconds(asset.duration) * Double(track.nominalFrameRate)).rounded())
let reader = try! AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
reader.add(out)

try? FileManager.default.removeItem(at: dst)
let writer = try! AVAssetWriter(outputURL: dst, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2, AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2, AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoMaxKeyFrameIntervalKey: 12,
    AVVideoAllowFrameReorderingKey: false,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoExpectedSourceFrameRateKey: 24,
    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
  ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
writer.add(input)
reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)

var i = 0
while let sb = out.copyNextSampleBuffer() {
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  let pts = CMSampleBufferGetPresentationTimeStamp(sb)
  let p = total > 1 ? min(1, Double(i) / Double(total - 1)) : 0
  let fx = fx0 + (fx1 - fx0) * p
  // Centro de la foto en pantalla 1:2 con object-position fx; ventana centrada ahí, en par (croma 4:2:0).
  let center = fx * (Double(srcW) - wRef) + wRef / 2
  var left = Int((center - Double(W) / 2).rounded())
  left = max(0, min(srcW - W, left)) & ~1
  while !input.isReadyForMoreMediaData { usleep(2000) }
  var outPB: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &outPB)
  let o = outPB!
  CVPixelBufferLockBaseAddress(pb, .readOnly); CVPixelBufferLockBaseAddress(o, [])
  for plane in 0..<2 {
    let s = CVPixelBufferGetBaseAddressOfPlane(pb, plane)!, d = CVPixelBufferGetBaseAddressOfPlane(o, plane)!
    let sb = CVPixelBufferGetBytesPerRowOfPlane(pb, plane), db = CVPixelBufferGetBytesPerRowOfPlane(o, plane)
    let rows = CVPixelBufferGetHeightOfPlane(o, plane)
    // Plano Y: 1 byte por px; plano CbCr: 2 bytes por par de px (left es par).
    let off = left, width = W
    for r in 0..<rows { memcpy(d + r * db, s + r * sb + off, width) }
  }
  CVPixelBufferUnlockBaseAddress(o, []); CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  adaptor.append(o, withPresentationTime: pts)
  i += 1
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { print("error:", writer.error as Any); exit(1) }
let size = (try! FileManager.default.attributesOfItem(atPath: dst.path)[.size] as! Int)
print(String(format: "%@  %d cuadros  %.2f MB", dst.lastPathComponent, i, Double(size) / 1e6))
