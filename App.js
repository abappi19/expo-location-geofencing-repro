import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const TASK = 'geofence-repro-task';

// Geofencing needs a task defined in the top-level scope.
TaskManager.defineTask(TASK, ({ data, error }) => {
  console.log('geofence event', data, error);
});

export default function App() {
  const [log, setLog] = useState('starting…');

  useEffect(() => {
    (async () => {
      const append = (line) => setLog((prev) => `${prev}\n${line}`) || console.log(line);

      const fg = await Location.requestForegroundPermissionsAsync();
      const bg = await Location.requestBackgroundPermissionsAsync();
      append(`foreground: ${fg.status}`);
      append(`background: ${bg.status}`);

      try {
        await Location.startGeofencingAsync(TASK, [
          { identifier: 'repro-region', latitude: 37.33, longitude: -122.03, radius: 150 },
        ]);
        append('startGeofencingAsync resolved — geofencing started.');
      } catch (e) {
        append(`threw ${e.code}`);
        append(e.message);
      }
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.log}>{log}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24 },
  log: { fontFamily: 'Courier', fontSize: 13 },
});
