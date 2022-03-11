--hey, use  
`webpack --mode development &&
node index.js`

QrCode matrix generator that written in typescript.  

/**  
 * This script is based on Kang Seonghoon's qr.js script.  
 * I did some maintain. Modernized the code with typescript, let, const, enums.  
 * Functions have been moved to object oriented structure. Added guarding  
 * keywords to methods and variables. Some transactions have been abstracted.  
 * The render methods have been removed from the script.  
 *  
 * Contrary to the original work, the generate method only returns us a 1-0 matrix.  
 * By writing a separate class for rendering, I hope to give the developer  
 * flexibility and freedom in matters such as shape, logo, colors and background.  
 *  
 * Written by Hakan Özoğlu - github.com/haandev <mhozoglu@yandex.com.tr>  
 *  
 * Still public domain :)  
 */  