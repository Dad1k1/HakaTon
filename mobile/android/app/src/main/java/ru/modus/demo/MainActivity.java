package ru.modus.demo;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.view.View;
import java.io.*;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private byte[] download;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        // Keep web content inside system bars on Android 15.
        getWindow().getDecorView().setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u=r.getUrl();
                if (!"app.local".equals(u.getHost())) return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                String p=u.getPath(); if (p==null || p.equals("/")) p="/index.html";
                if(p.contains(".."))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                String ext=MimeTypeMap.getFileExtensionFromUrl(p);
                String mime=ext.equals("js")?"application/javascript":ext.equals("css")?"text/css":ext.equals("html")?"text/html":MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                try {return new WebResourceResponse(mime==null?"application/octet-stream":mime,"UTF-8",getAssets().open(p.substring(1)));}
                catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !"app.local".equals(r.getUrl().getHost()) && !"data".equals(r.getUrl().getScheme()); }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if(!url.startsWith("data:"))return;
            try {
                download=android.util.Base64.decode(url.substring(url.indexOf(',')+1), android.util.Base64.DEFAULT);
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime==null?"application/octet-stream":mime).addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"attachment");
                startActivityForResult(intent,2);
            } catch(Exception e){download=null;}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){
                new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Да",(d,w)->result.confirm()).setNegativeButton("Отмена",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params){
                if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;
                try {startActivityForResult(params.createIntent(),1);return true;} catch(Exception e){chooser=null;return false;}
            }
        });
        setContentView(web);
        web.loadUrl("https://app.local/");
    }
    @Override protected void onActivityResult(int request, int result, Intent data){super.onActivityResult(request,result,data);
        if(request==2 && download!=null){if(result==RESULT_OK && data!=null)try(java.io.OutputStream stream=getContentResolver().openOutputStream(data.getData())){stream.write(download);}catch(Exception e){}download=null;}
        if(request==1&&chooser!=null){chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));chooser=null;}}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
