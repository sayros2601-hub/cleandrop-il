package il.cleandrop.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val appUrl = "https://cleandrop-il.sayros2601.workers.dev"
    private val ownHost = "cleandrop-il.sayros2601.workers.dev"

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var webView: WebView

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback
            filePathCallback = null
            if (callback == null) return@registerForActivityResult

            if (result.resultCode == Activity.RESULT_OK) {
                val dataUri = result.data?.data
                val clipData = result.data?.clipData
                val uris = when {
                    clipData != null && clipData.itemCount > 0 ->
                        Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                    dataUri != null -> arrayOf(dataUri)
                    cameraImageUri != null -> arrayOf(cameraImageUri!!)
                    else -> null
                }
                callback.onReceiveValue(uris)
            } else {
                callback.onReceiveValue(null)
            }
            cameraImageUri = null
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            launchFileChooser(includeCamera = granted)
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.parseColor("#0F766E")

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(Color.parseColor("#0F766E"), Color.parseColor("#10B981"))
            setOnRefreshListener { webView.reload() }
        }

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
            }

            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return false
                    val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: ""
                    val host = uri.host?.lowercase(Locale.ROOT) ?: ""

                    if ((scheme == "https" || scheme == "http") && host == ownHost) {
                        return false
                    }

                    return try {
                        val intent = Intent(Intent.ACTION_VIEW, uri)
                        startActivity(intent)
                        true
                    } catch (_: Exception) {
                        true
                    }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    swipeRefresh.isRefreshing = false
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        swipeRefresh.isRefreshing = false
                        val offlineHtml = """
                            <!doctype html>
                            <html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
                            <style>
                            body{font-family:sans-serif;background:#F4FBF8;color:#0F172A;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}
                            .box{background:#fff;border:1px solid #D7EAE2;border-radius:20px;padding:24px;max-width:340px;}
                            button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:12px;background:#0F766E;color:#fff;font-weight:700;font-size:16px;}
                            </style></head>
                            <body><div class="box">
                            <h2>אין חיבור לאינטרנט<br/>لا يوجد اتصال بالإنترنت<br/>Нет соединения</h2>
                            <button onclick="location.href='$appUrl'">נסה שוב / Retry</button>
                            </div></body></html>
                        """.trimIndent()
                        view?.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null)
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback

                    val hasCamera = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED

                    if (hasCamera) {
                        launchFileChooser(includeCamera = true)
                    } else {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                    return true
                }
            }
        }

        swipeRefresh.addView(webView)
        setContentView(swipeRefresh)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(appUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun launchFileChooser(includeCamera: Boolean) {
        val galleryIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
        }

        val initialIntents = mutableListOf<Intent>()
        if (includeCamera) {
            try {
                val imagesDir = File(cacheDir, "images").apply { mkdirs() }
                val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
                val photoFile = File(imagesDir, "proof_$stamp.jpg")
                val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", photoFile)
                cameraImageUri = uri
                val camIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }
                initialIntents.add(camIntent)
            } catch (_: Exception) {
                cameraImageUri = null
            }
        }

        val chooser = Intent(Intent.ACTION_CHOOSER).apply {
            putExtra(Intent.EXTRA_INTENT, galleryIntent)
            putExtra(Intent.EXTRA_TITLE, "CleanDrop Proof Photo")
            if (initialIntents.isNotEmpty()) {
                putExtra(Intent.EXTRA_INITIAL_INTENTS, initialIntents.toTypedArray())
            }
        }

        try {
            fileChooserLauncher.launch(chooser)
        } catch (_: Exception) {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
