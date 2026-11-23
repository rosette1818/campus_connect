'use strict';
(() => {
    const THEME_KEY = 'campusconnect-theme';
    const root = document.documentElement;
     
    function getSavedTheme(){
        try{
            const saved = localStorage.getItem(THEME_KEY);
            return saved == 'dark' || saved === 'light' ? saved : null;
        } catch {
            return null;
        }
    }
 
    function saveTheme(theme){
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            /* not saved, but the switch still works for this visit*/
        }
    }

    function getDeviceTheme(){
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        
    }

    //apply a theme and update the button's icon and label
    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);

        const button = document.getElementById('theme-toggle');
        if(button) {
            const isDark = theme === 'dark';
            button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            button.title = isDark ? 'Light mode' : 'Dark mode';
        }

    }
    

    //set the theme immediately

    applyTheme(getSavedTheme() || getDeviceTheme());

    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(root.getAttribute('data-theme'));

        document.getElementById('theme-toggle').addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            saveTheme(next);
        });
    });
    
})();