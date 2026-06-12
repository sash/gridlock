import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';

/**
 * Native shell for GridLock: the complete game ships as a single offline HTML
 * file (built by `npm run build:native` in the repo root) rendered in a
 * WebView. The game posts haptic cues over the bridge; everything else —
 * rendering, audio, persistence via localStorage — lives in the web build.
 */

const HAPTICS: Record<string, () => Promise<void>> = {
  place: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  clear: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  'big-clear': () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  perfect: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  'game-over': () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

function onGameMessage(event: WebViewMessageEvent): void {
  try {
    const msg = JSON.parse(event.nativeEvent.data) as { type?: string; kind?: string };
    if (msg.type === 'haptic' && msg.kind && HAPTICS[msg.kind]) {
      void HAPTICS[msg.kind]();
    }
  } catch {
    // ignore non-JSON messages
  }
}

export default function App() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const asset = Asset.fromModule(require('./assets/game.html'));
      await asset.downloadAsync();
      setHtml(await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri));
    })();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden />
      {html !== null && (
        <WebView
          // a stable baseUrl gives the page an origin, so localStorage persists
          source={{ html, baseUrl: 'https://gridlock.app' }}
          originWhitelist={['*']}
          onMessage={onGameMessage}
          domStorageEnabled
          // the game synthesizes its own audio; don't gate it behind a tap
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          style={styles.webview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10131a' },
  webview: { flex: 1, backgroundColor: '#10131a' },
});
