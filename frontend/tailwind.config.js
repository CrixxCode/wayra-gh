module.exports = {
    content: [
        "./src/**/*.{html,ts}",
        "./node_modules/flowbite/**/*.js" // 👈 añadimos soporte para Flowbite
    ],
    theme: {
        extend: {},
    },
    plugins: [
        require('flowbite/plugin') // 👈 plugin de Flowbite
    ],
};