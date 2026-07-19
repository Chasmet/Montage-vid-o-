# Remix Studio conserve le code WebView et le pont JavaScript.
-keepclassmembers class com.chasmet.remixstudio.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
