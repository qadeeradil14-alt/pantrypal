import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entries: [SimpleEntry] = [SimpleEntry(date: Date())]
        let timeline = Timeline(entries: entries, policy: .never)
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
}

struct PantryPalWidgetEntryView : View {
    var entry: Provider.Entry

    var body: some View {
        ZStack {
            Color(red: 0.85, green: 0.35, blue: 0.15) // PantryPal Primary Brown/Red
            
            VStack {
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 40))
                    .foregroundColor(.white)
                
                Text("Quick Scan")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.top, 8)
            }
        }
        .widgetURL(URL(string: "pantrypal://shopping?action=scan"))
    }
}

@main
struct PantryPalWidget: Widget {
    let kind: String = "PantryPalWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            PantryPalWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Quick Scan")
        .description("Scan a receipt directly into your pantry.")
        .supportedFamilies([.systemSmall])
    }
}
