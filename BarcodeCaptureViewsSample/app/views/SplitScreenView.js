import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    AppState,
    Button,
    BackHandler,
    ScrollView,
    Text,
    View,
} from 'react-native';

import { styles } from '../styles';
import {
    Camera,
    CameraSettings,
    DataCaptureContext,
    DataCaptureView,
    Feedback,
    FrameSourceState,
    LaserlineViewfinder,
    LaserlineViewfinderStyle,
    MeasureUnit,
    NumberWithUnit,
    RadiusLocationSelection,
    VideoResolution,
} from 'scandit-react-native-datacapture-core';
import {
    BarcodeCapture,
    BarcodeCaptureFeedback,
    BarcodeCaptureOverlay,
    BarcodeCaptureSettings,
    Symbology,
    SymbologyDescription,
} from 'scandit-react-native-datacapture-barcode';

import { requestCameraPermissionsIfNeeded } from '../camera-permission-handler';

import licenseKey  from '../license';

export const SplitScreenView = ({ navigation }) => {
    const viewRef = useRef(null);

    const [dataCaptureContext, setDataCaptureContext] = useState(DataCaptureContext.forLicenseKey(licenseKey));
    const [results, setResults] = useState([]);
    const [camera, setCamera] = useState(null);
    const [barcodeCaptureMode, setBarcodeCaptureMode] = useState(null);
    const [isBarcodeCaptureEnabled, setIsBarcodeCaptureEnabled] = useState(false);
    const [scannedBarcodeData, setScannedBarcodeData] = useState(null);

    const [cameraState, setCameraState] = useState(FrameSourceState.Off);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Button title={'Clear'}
                        color={'#dadada'}
                        onPress={() => setResults([])}
                />
            ),
        });
    }, [navigation]);

    useEffect(() => {
        handleAppStateChangeSubscription = AppState.addEventListener('change', handleAppStateChange);
        setupScanning();
        startCapture();
        return () => {
            handleAppStateChangeSubscription.remove();
            dataCaptureContext.dispose();
        }
    }, []);

    useEffect(() => {
        if (camera) {
            camera.switchToDesiredState(cameraState);
        }
        return () => {
            // Turn of the camera only when the component is unmounting, which means
            // the current view is no longer available.
            if (camera && !viewRef.current) {
                camera.switchToDesiredState(FrameSourceState.Off);
            }
        }
    }, [cameraState]);

    useEffect(() => {
        if (barcodeCaptureMode) {
            barcodeCaptureMode.isEnabled = isBarcodeCaptureEnabled;
        }
        return () => {
            // Disable barcodeCaptureMode only when the component is unmounting, which means
            // the current view is no longer available.
            if (barcodeCaptureMode && !viewRef.current) {
                barcodeCaptureMode.isEnabled = false;
            }
        }
    }, [isBarcodeCaptureEnabled]);

    useEffect(() => {
        if (scannedBarcodeData) {
            setResults([
                ...results,
                scannedBarcodeData,
            ])
        }
    }, [scannedBarcodeData]);


    const handleAppStateChange = async (nextAppState) => {
        if (!nextAppState.match(/inactive|background/)) {
            startCapture();
        }
    }

    const setupScanning = () => {
        // Barcode capture is configured through barcode capture settings which are then
        // applied to the barcode capture instance that manages barcode capture.
        const settings = new BarcodeCaptureSettings();

        // The settings instance initially has all types of barcodes (symbologies) disabled. For the purpose of this
        // sample we enable a very generous set of symbologies. In your own app ensure that you only enable the
        // symbologies that your app requires as every additional enabled symbology has an impact on processing times.
        settings.enableSymbologies([
            Symbology.EAN13UPCA,
            Symbology.EAN8,
            Symbology.UPCE,
            Symbology.QR,
            Symbology.DataMatrix,
            Symbology.Code39,
            Symbology.Code128,
            Symbology.InterleavedTwoOfFive,
        ]);

        // Set the time interval in which codes with the same symbology/data are filtered out as duplicates
        settings.codeDuplicateFilter = 1000;

        settings.locationSelection = new RadiusLocationSelection(
            new NumberWithUnit(0, MeasureUnit.Fraction)
        );

        // Some linear/1d barcode symbologies allow you to encode variable-length data. By default, the Scandit
        // Data Capture SDK only scans barcodes in a certain length range. If your application requires scanning of one
        // of these symbologies, and the length is falling outside the default range, you may need to adjust the
        // 'active symbol counts' for this symbology. This is shown in the following few lines of code for one of the
        // variable-length symbologies.
        const symbologySettings = settings.settingsForSymbology(Symbology.Code39);
        symbologySettings.activeSymbolCounts = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

        // Create new barcode capture mode with the settings from above.
        const barcodeCaptureMode = BarcodeCapture.forContext(dataCaptureContext, settings);

        // Register a listener to get informed whenever a new barcode is tracked.
        const barcodeCaptureListener = {
            didScan: (_, session) => {
                const barcode = session.newlyRecognizedBarcodes[0];
                const symbology = new SymbologyDescription(barcode.symbology);

                setScannedBarcodeData({
                    data: barcode.data,
                    symbology: symbology.readableName,
                })
            }
        };

        // Add the listener to the barcode capture context.
        barcodeCaptureMode.addListener(barcodeCaptureListener);

        // Remove feedback so we can create custom feedback later on.
        const feedback = BarcodeCaptureFeedback.default;
        feedback.success = new Feedback(null, null);
        barcodeCaptureMode.feedback = feedback;

        // Add a laserline viewfinder to the scanner.
        const barcodeCaptureOverlay = BarcodeCaptureOverlay.withBarcodeCaptureForView(barcodeCaptureMode, null);
        barcodeCaptureOverlay.viewfinder = new LaserlineViewfinder(LaserlineViewfinderStyle.Animated);

        viewRef.current.addOverlay(barcodeCaptureOverlay);
        setBarcodeCaptureMode(barcodeCaptureMode);
    }

    const startCapture = () => {
        startCamera();
        setIsBarcodeCaptureEnabled(true);
    }

    const startCamera = () => {
        if (!camera) {
            // Use the world-facing (back) camera and set it as the frame source of the context. The camera is off by
            // default and must be turned on to start streaming frames to the data capture context for recognition.
            const camera = Camera.default;
            dataCaptureContext.setFrameSource(camera);

            const cameraSettings = new CameraSettings();
            cameraSettings.preferredResolution = VideoResolution.UHD4K;
            camera.applySettings(cameraSettings);
            setCamera(camera);
        }

        // Switch camera on to start streaming frames and enable the barcode capture mode.
        // The camera is started asynchronously and will take some time to completely turn on.
        requestCameraPermissionsIfNeeded()
            .then(() => setCameraState(FrameSourceState.On))
            .catch(() => BackHandler.exitApp());
    }

    return (
        <View style={styles.splitView}>
            <DataCaptureView
                style={styles.splitViewDataCapture}
                context={dataCaptureContext}
                ref={viewRef}
            />
            <ScrollView style={styles.splitViewResults}>
                {
                    results.map((result, index) =>
                        <View key={index} style={styles.splitViewResult}>
                            <Text style={styles.splitViewResultData}>{result.data}</Text>
                            <Text style={styles.splitViewResultSymbology}>{result.symbology}</Text>
                        </View>)
                }
            </ScrollView>
        </View>
    );
}
